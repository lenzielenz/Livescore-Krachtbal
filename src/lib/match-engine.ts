// Server-side match-engine: vertaalt aantekenaar-acties naar immutable worp-events en
// beheert het balbezit-leven. Gebruikt de pure regellogica uit krachtbal-rules.ts.
//
// Alle mutaties draaien met overrideAccess (server is vertrouwd); de Throws-immutability
// (access.update=false) blijft gelden voor externe API-calls.

import type { Payload } from 'payload'

import type { Category } from './categories'
import type { AttackDir, Point } from './field'
import {
  type SetupSide,
  type TeamSide,
  type ThrowType,
  attackDirForSide,
  deriveGeometry,
  deriveOutcome,
  isMidlineFault,
  isTerminalOutcome,
  nextSetup,
  reduceTotals,
  throwsAllowed,
} from './krachtbal-rules'

export { attackDirForSide }

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

async function loadMatch(payload: Payload, matchId: number) {
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 })
  const homeId = typeof match.homeTeam === 'object' ? match.homeTeam.id : match.homeTeam
  const awayId = typeof match.awayTeam === 'object' ? match.awayTeam.id : match.awayTeam
  return { match, homeId, awayId }
}

function sideOfTeam(teamId: number, homeId: number): TeamSide {
  return teamId === homeId ? 'home' : 'away'
}

async function getOpenPossession(payload: Payload, matchId: number) {
  const res = await payload.find({
    collection: 'possessions',
    where: { and: [{ match: { equals: matchId } }, { endOutcome: { exists: false } }] },
    sort: '-createdAt',
    depth: 0,
    limit: 1,
  })
  return res.docs[0] ?? null
}

async function createPossession(
  payload: Payload,
  args: {
    matchId: number
    teamId: number
    setupSide: SetupSide
    category: Category
    dir: AttackDir
    point: Point
    half: number
    clock: number
  },
) {
  return payload.create({
    collection: 'possessions',
    data: {
      match: args.matchId,
      team: args.teamId,
      setupSide: args.setupSide,
      throwsAllowed: throwsAllowed(args.category, args.setupSide),
      setupX: clamp01(args.point.x),
      setupY: clamp01(args.point.y),
      dir: args.dir,
      startHalf: args.half,
      startClock: args.clock,
    },
    overrideAccess: true,
  })
}

/** Start de wedstrijd: zet live, helft 1, klok op 0, en maak het eerste balbezit. */
export async function startMatch(payload: Payload, matchId: number, startingTeamId: number) {
  const { match, homeId } = await loadMatch(payload, matchId)
  const side = sideOfTeam(startingTeamId, homeId)
  const dir = attackDirForSide(side, 1)

  await payload.update({
    collection: 'matches',
    id: matchId,
    data: { status: 'live', currentHalf: 1, clockSeconds: 0, clockRunning: false },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'match-events',
    data: { match: matchId, type: 'half_start', half: 1, gameClock: 0 },
    overrideAccess: true,
  })
  // Opzet bij aftrap: vanaf eigen helft, vertrekpunt midden eigen helft.
  const ownHalfY = dir === 'up' ? 12 / 46 : 34 / 46
  await createPossession(payload, {
    matchId,
    teamId: startingTeamId,
    setupSide: 'own',
    category: match.category as Category,
    dir,
    point: { x: 0.5, y: ownHalfY },
    half: 1,
    clock: 0,
  })
  return buildMatchState(payload, matchId)
}

export interface RecordThrowInput {
  matchId: number
  playerId: number
  type: ThrowType
  point: Point
  tapCount: 1 | 2
  touchedBeforeOut?: boolean
  gameClock?: number
}

/** Registreer één worp en beheer het balbezit (afsluiten + volgend opzet). */
export async function recordThrow(payload: Payload, input: RecordThrowInput) {
  const { match, homeId, awayId } = await loadMatch(payload, input.matchId)
  const open = await getOpenPossession(payload, input.matchId)
  if (!open) throw new Error('Geen lopend balbezit — start de wedstrijd eerst.')

  const teamId = typeof open.team === 'object' ? open.team.id : open.team
  const side = sideOfTeam(teamId, homeId)
  const dir = (open.dir as AttackDir | null) ?? attackDirForSide(side, match.currentHalf ?? 1)
  const half = match.currentHalf ?? 1
  const clock = input.gameClock ?? match.clockSeconds ?? 0

  const existing = await payload.find({
    collection: 'throws',
    where: { possession: { equals: open.id } },
    sort: 'throwNumber',
    depth: 0,
    limit: 100,
  })
  const throwNumber = existing.docs.length + 1
  const last = existing.docs[existing.docs.length - 1]

  // Een speler mag niet twee worpen na elkaar doen binnen hetzelfde balbezit.
  if (last) {
    const lastPlayerId = typeof last.player === 'object' ? last.player.id : last.player
    if (lastPlayerId === input.playerId) {
      throw new Error('Dezelfde speler mag niet 2 worpen na elkaar doen.')
    }
  }

  const origin: Point = last
    ? { x: last.landingX, y: last.landingY }
    : { x: open.setupX ?? 0.5, y: open.setupY ?? 0.5 }

  const outcome = deriveOutcome({ tapCount: input.tapCount, point: input.point, dir })
  const geom = deriveGeometry(origin, input.point, dir)

  const created = await payload.create({
    collection: 'throws',
    data: {
      match: input.matchId,
      possession: open.id,
      team: teamId,
      player: input.playerId,
      throwNumber,
      type: input.type,
      outcome,
      landingX: clamp01(input.point.x),
      landingY: clamp01(input.point.y),
      distance: geom.distance,
      zone: geom.zone,
      touchedBeforeOut: outcome === 'out_back' ? !!input.touchedBeforeOut : false,
      period: half,
      gameClock: clock,
    },
    overrideAccess: true,
  })

  // Bepaal of het balbezit eindigt.
  const fault = isMidlineFault({
    setupSide: open.setupSide as SetupSide,
    throwNumber,
    outcome,
    landing: input.point,
    dir,
  })
  const terminal = isTerminalOutcome(outcome)
  const exhausted = !terminal && throwNumber >= (open.throwsAllowed ?? 1)

  type PossessionEnd = 'goal' | 'caught' | 'out_side' | 'out_back' | 'midline_fault' | 'throws_exhausted'
  const endOutcome: PossessionEnd | null = fault
    ? 'midline_fault'
    : terminal
      ? (outcome as Exclude<typeof outcome, 'in_field'>)
      : exhausted
        ? 'throws_exhausted'
        : null

  if (endOutcome) {
    await payload.update({
      collection: 'possessions',
      id: open.id,
      data: { endOutcome },
      overrideAccess: true,
    })
    if (match.status !== 'finished') {
      const ns = nextSetup({
        outcome: endOutcome as Parameters<typeof nextSetup>[0]['outcome'],
        landing: input.point,
        throwerTeam: side,
        throwerDir: dir,
      })
      await createPossession(payload, {
        matchId: input.matchId,
        teamId: ns.team === 'home' ? homeId : awayId,
        setupSide: ns.setupSide,
        category: match.category as Category,
        dir: ns.dir,
        point: ns.point,
        half,
        clock,
      })
    }
  }

  return { throwId: created.id, outcome, state: await buildMatchState(payload, input.matchId) }
}

/** Undo: verwijder de laatste worp en herstel het balbezit. */
export async function undoLastThrow(payload: Payload, matchId: number) {
  const res = await payload.find({
    collection: 'throws',
    where: { match: { equals: matchId } },
    sort: '-createdAt',
    depth: 0,
    limit: 1,
  })
  const last = res.docs[0]
  if (!last) return buildMatchState(payload, matchId)

  const possId = typeof last.possession === 'object' ? last.possession.id : last.possession
  await payload.delete({ collection: 'throws', id: last.id, overrideAccess: true })

  // Verwijder een eventueel daarna aangemaakt (leeg) vervolg-balbezit.
  const laterEmpty = await payload.find({
    collection: 'possessions',
    where: { and: [{ match: { equals: matchId } }, { id: { greater_than: possId } }] },
    sort: 'createdAt',
    depth: 0,
    limit: 50,
  })
  for (const p of laterEmpty.docs) {
    const count = await payload.count({
      collection: 'throws',
      where: { possession: { equals: p.id } },
    })
    if (count.totalDocs === 0) {
      await payload.delete({ collection: 'possessions', id: p.id, overrideAccess: true })
    }
  }

  // Heropen het balbezit van de verwijderde worp.
  await payload.update({
    collection: 'possessions',
    id: possId,
    data: { endOutcome: null },
    overrideAccess: true,
  })

  return buildMatchState(payload, matchId)
}

/** Start/pauzeer of zet de klok. */
export async function setClock(
  payload: Payload,
  matchId: number,
  data: { running?: boolean; seconds?: number },
) {
  await payload.update({
    collection: 'matches',
    id: matchId,
    data: {
      ...(data.seconds !== undefined ? { clockSeconds: data.seconds } : {}),
      ...(data.running !== undefined ? { clockRunning: data.running } : {}),
      clockUpdatedAt: new Date().toISOString(),
    },
    overrideAccess: true,
  })
  return buildMatchState(payload, matchId)
}

/**
 * Naar de tweede helft: klok terug op 0, ploegen wisselen van veldhelft (richting draait om).
 * Het lopende balbezit wordt afgesloten en de 2e helft start met een verse opzet door de ploeg
 * die NIET aftrapte in de 1e helft — met de correcte speelrichting voor die helft.
 */
export async function advanceHalf(payload: Payload, matchId: number) {
  const { match, homeId, awayId } = await loadMatch(payload, matchId)
  const half = match.currentHalf ?? 1
  const nextHalf = half + 1

  // Sluit een eventueel lopend balbezit af bij het rustsignaal.
  const open = await getOpenPossession(payload, matchId)
  if (open) {
    await payload.update({
      collection: 'possessions',
      id: open.id,
      data: { endOutcome: 'throws_exhausted' },
      overrideAccess: true,
    })
  }

  await payload.create({
    collection: 'match-events',
    data: { match: matchId, type: 'half_end', half, gameClock: match.clockSeconds ?? 0 },
    overrideAccess: true,
  })
  await payload.update({
    collection: 'matches',
    id: matchId,
    data: { currentHalf: nextHalf, clockSeconds: 0, clockRunning: false },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'match-events',
    data: { match: matchId, type: 'half_start', half: nextHalf, gameClock: 0 },
    overrideAccess: true,
  })

  // Wie tikte af in helft 1? De tegenploeg zet op in helft 2.
  const first = await payload.find({
    collection: 'possessions',
    where: { match: { equals: matchId } },
    sort: 'createdAt',
    depth: 0,
    limit: 1,
  })
  const firstTeamId = first.docs[0]
    ? typeof first.docs[0].team === 'object'
      ? first.docs[0].team.id
      : first.docs[0].team
    : homeId
  const startTeamId = firstTeamId === homeId ? awayId : homeId
  const startSide = sideOfTeam(startTeamId, homeId)
  const dir = attackDirForSide(startSide, nextHalf)
  const ownHalfY = dir === 'up' ? 12 / 46 : 34 / 46
  await createPossession(payload, {
    matchId,
    teamId: startTeamId,
    setupSide: 'own',
    category: match.category as Category,
    dir,
    point: { x: 0.5, y: ownHalfY },
    half: nextHalf,
    clock: 0,
  })

  return buildMatchState(payload, matchId)
}

export async function finishMatch(payload: Payload, matchId: number) {
  const { match } = await loadMatch(payload, matchId)
  await payload.create({
    collection: 'match-events',
    data: {
      match: matchId,
      type: 'half_end',
      half: match.currentHalf ?? 2,
      gameClock: match.clockSeconds ?? 0,
    },
    overrideAccess: true,
  })
  await payload.update({
    collection: 'matches',
    id: matchId,
    data: { status: 'finished', clockRunning: false },
    overrideAccess: true,
  })
  return buildMatchState(payload, matchId)
}

/** Time-out registreren (telt mee in het quotum 2 per ploeg per helft). */
export async function recordTimeout(payload: Payload, matchId: number, teamId: number) {
  const { match } = await loadMatch(payload, matchId)
  await payload.create({
    collection: 'match-events',
    data: {
      match: matchId,
      type: 'timeout',
      team: teamId,
      half: match.currentHalf ?? 1,
      gameClock: match.clockSeconds ?? 0,
    },
    overrideAccess: true,
  })
  return buildMatchState(payload, matchId)
}

// ── Afgeleide match-state (voor scorekeeper, scorebord, SSE) ──────────────────

export interface MatchState {
  match: {
    id: number
    title: string | null
    status: string
    category: Category
    currentHalf: number
    clockSeconds: number
    clockRunning: boolean
    clockUpdatedAt: string | null
  }
  teams: { home: { id: number; name: string }; away: { id: number; name: string } }
  score: { home: number; away: number }
  crosses: { home: number; away: number }
  timeouts: { home: number; away: number }
  possession: {
    side: TeamSide
    teamId: number
    setupSide: SetupSide
    throwsAllowed: number
    throwsUsed: number
    nextThrowNumber: number
    dir: AttackDir
    /** Speler van de vorige worp in dit balbezit — mag niet 2× na elkaar werpen. */
    lastPlayerId: number | null
  } | null
}

export interface SheetGoal {
  half: number
  gameClock: number
  side: TeamSide
  shirtNumber: number
  playerName: string
  type: ThrowType
  points: number
}

export interface MatchSheet {
  match: { id: number; title: string | null; date: string; category: Category; status: string }
  teams: { home: { id: number; name: string }; away: { id: number; name: string } }
  rosters: { home: { shirtNumber: number; name: string }[]; away: { shirtNumber: number; name: string }[] }
  goals: SheetGoal[]
  halfScores: { home: [number, number]; away: [number, number] }
  totals: { home: number; away: number }
  crosses: { home: number; away: number }
  timeouts: { home: [number, number]; away: [number, number] }
}

/** Geldig digitaal aantekenblad: opstellingen, doelpunten, helft-scores, time-outs, kruisjes. */
export async function buildMatchSheet(payload: Payload, matchId: number): Promise<MatchSheet> {
  const { match, homeId, awayId } = await loadMatch(payload, matchId)
  const [home, away] = await Promise.all([
    payload.findByID({ collection: 'teams', id: homeId, depth: 0 }),
    payload.findByID({ collection: 'teams', id: awayId, depth: 0 }),
  ])

  const playersRes = await payload.find({
    collection: 'players',
    where: { team: { in: [homeId, awayId] } },
    sort: 'shirtNumber',
    depth: 0,
    limit: 200,
  })
  const rosters = { home: [] as { shirtNumber: number; name: string }[], away: [] as { shirtNumber: number; name: string }[] }
  for (const p of playersRes.docs) {
    const tId = typeof p.team === 'object' ? p.team.id : p.team
    ;(tId === homeId ? rosters.home : rosters.away).push({ shirtNumber: p.shirtNumber, name: p.name })
  }

  const throwsRes = await payload.find({
    collection: 'throws',
    where: { match: { equals: matchId } },
    sort: 'createdAt',
    depth: 1,
    limit: 2000,
  })

  const goals: SheetGoal[] = []
  const halfScores = { home: [0, 0] as [number, number], away: [0, 0] as [number, number] }
  const crosses = { home: 0, away: 0 }

  for (const t of throwsRes.docs) {
    const teamId = typeof t.team === 'object' ? t.team.id : t.team
    const side = sideOfTeam(teamId, homeId)
    const halfIdx = (t.period ?? 1) === 2 ? 1 : 0
    if (t.outcome === 'goal') {
      const points = t.type === 'rug' ? 2 : 1
      const player = typeof t.player === 'object' && t.player ? t.player : null
      goals.push({
        half: t.period,
        gameClock: t.gameClock,
        side,
        shirtNumber: player?.shirtNumber ?? 0,
        playerName: player?.name ?? '—',
        type: t.type,
        points,
      })
      halfScores[side][halfIdx] += points
    } else if (t.outcome === 'out_back' && !t.touchedBeforeOut) {
      crosses[side] += 1
    }
  }

  const timeoutsRes = await payload.find({
    collection: 'match-events',
    where: { and: [{ match: { equals: matchId } }, { type: { equals: 'timeout' } }] },
    depth: 0,
    limit: 200,
  })
  const timeouts = { home: [0, 0] as [number, number], away: [0, 0] as [number, number] }
  for (const e of timeoutsRes.docs) {
    const tId = typeof e.team === 'object' && e.team ? e.team.id : e.team
    if (!tId) continue
    const side = sideOfTeam(tId, homeId)
    timeouts[side][(e.half ?? 1) === 2 ? 1 : 0] += 1
  }

  return {
    match: {
      id: match.id,
      title: match.title ?? null,
      date: match.date,
      category: match.category as Category,
      status: match.status,
    },
    teams: { home: { id: home.id, name: home.name }, away: { id: away.id, name: away.name } },
    rosters,
    goals,
    halfScores,
    totals: {
      home: halfScores.home[0] + halfScores.home[1],
      away: halfScores.away[0] + halfScores.away[1],
    },
    crosses,
    timeouts,
  }
}

export interface ShotPoint {
  x: number
  y: number
  outcome: string
  type: ThrowType
  playerId: number
  shirtNumber: number
  teamSide: TeamSide
  throwNumber: number
  isLastThrow: boolean
}

/** Statistiek-aggregaten + shot map-punten voor de matchdetailpagina. */
export async function buildMatchStats(payload: Payload, matchId: number) {
  const { homeId } = await loadMatch(payload, matchId)
  const throwsRes = await payload.find({
    collection: 'throws',
    where: { match: { equals: matchId } },
    sort: 'createdAt',
    depth: 1,
    limit: 2000,
  })
  const possRes = await payload.find({
    collection: 'possessions',
    where: { match: { equals: matchId } },
    depth: 0,
    limit: 1000,
  })
  const possById = new Map(possRes.docs.map((p) => [p.id, p]))

  const stat: import('./stats').StatThrow[] = []
  const shots: ShotPoint[] = []

  for (const t of throwsRes.docs) {
    const possId = typeof t.possession === 'object' ? t.possession.id : t.possession
    const allowed = possById.get(possId)?.throwsAllowed ?? 1
    const player = typeof t.player === 'object' && t.player ? t.player : null
    const teamId = typeof t.team === 'object' ? t.team.id : t.team
    const side = sideOfTeam(teamId, homeId)
    stat.push({
      playerId: player?.id ?? 0,
      playerName: player?.name ?? '—',
      shirtNumber: player?.shirtNumber ?? 0,
      teamSide: side,
      throwNumber: t.throwNumber,
      isLastThrow: isTerminalOutcome(t.outcome) || t.throwNumber >= allowed,
      type: t.type,
      outcome: t.outcome,
      distance: t.distance ?? null,
      zone: t.zone ?? null,
    })
    shots.push({
      x: t.landingX,
      y: t.landingY,
      outcome: t.outcome,
      type: t.type,
      playerId: player?.id ?? 0,
      shirtNumber: player?.shirtNumber ?? 0,
      teamSide: side,
      throwNumber: t.throwNumber,
      isLastThrow: isTerminalOutcome(t.outcome) || t.throwNumber >= allowed,
    })
  }

  const { aggregateStats } = await import('./stats')
  return { stats: aggregateStats(stat), shots }
}

export interface TimelineItem {
  id: string
  kind: 'goal' | 'cross' | 'timeout' | 'half_start' | 'half_end' | 'referee_stop'
  half: number
  gameClock: number
  side: TeamSide | null
  label: string
}

/** Chronologische tijdlijn (doelpunten, kruisjes, time-outs, helft-grenzen). */
export async function buildTimeline(payload: Payload, matchId: number): Promise<TimelineItem[]> {
  const { homeId } = await loadMatch(payload, matchId)

  const throwsRes = await payload.find({
    collection: 'throws',
    where: { match: { equals: matchId } },
    sort: 'createdAt',
    depth: 1,
    limit: 1000,
  })
  const eventsRes = await payload.find({
    collection: 'match-events',
    where: { match: { equals: matchId } },
    sort: 'createdAt',
    depth: 0,
    limit: 1000,
  })

  const items: (TimelineItem & { _t: string })[] = []

  for (const t of throwsRes.docs) {
    const teamId = typeof t.team === 'object' ? t.team.id : t.team
    const side = sideOfTeam(teamId, homeId)
    if (t.outcome === 'goal') {
      const pts = t.type === 'rug' ? 2 : 1
      const player = typeof t.player === 'object' && t.player ? t.player : null
      const who = player ? `#${player.shirtNumber} ${player.name}` : ''
      items.push({
        id: `t${t.id}`,
        kind: 'goal',
        half: t.period,
        gameClock: t.gameClock,
        side,
        label: `Doelpunt +${pts} ${who}`.trim(),
        _t: t.createdAt,
      })
    } else if (t.outcome === 'out_back' && !t.touchedBeforeOut) {
      items.push({
        id: `c${t.id}`,
        kind: 'cross',
        half: t.period,
        gameClock: t.gameClock,
        side,
        label: 'Kruisje',
        _t: t.createdAt,
      })
    }
  }

  for (const e of eventsRes.docs) {
    const teamId = typeof e.team === 'object' && e.team ? e.team.id : e.team
    const side = teamId ? sideOfTeam(teamId, homeId) : null
    const label =
      e.type === 'timeout'
        ? 'Time-out'
        : e.type === 'referee_stop'
          ? 'Scheidsrechter-onderbreking'
          : e.type === 'half_start'
            ? `Start helft ${e.half}`
            : `Einde helft ${e.half}`
    items.push({ id: `e${e.id}`, kind: e.type, half: e.half, gameClock: e.gameClock, side, label, _t: e.createdAt })
  }

  items.sort((a, b) => (a._t < b._t ? -1 : a._t > b._t ? 1 : 0))
  return items.map(({ _t, ...rest }) => rest)
}

export async function buildMatchState(payload: Payload, matchId: number): Promise<MatchState> {
  const { match, homeId, awayId } = await loadMatch(payload, matchId)
  const [home, away] = await Promise.all([
    payload.findByID({ collection: 'teams', id: homeId, depth: 0 }),
    payload.findByID({ collection: 'teams', id: awayId, depth: 0 }),
  ])

  const throwsRes = await payload.find({
    collection: 'throws',
    where: { match: { equals: matchId } },
    sort: 'createdAt',
    depth: 0,
    limit: 1000,
  })
  const possRes = await payload.find({
    collection: 'possessions',
    where: { match: { equals: matchId } },
    depth: 0,
    limit: 1000,
  })
  const possById = new Map(possRes.docs.map((p) => [p.id, p]))

  const reducible = throwsRes.docs.map((t) => {
    const possId = typeof t.possession === 'object' ? t.possession.id : t.possession
    const poss = possById.get(possId)
    const allowed = poss?.throwsAllowed ?? 1
    const teamId = typeof t.team === 'object' ? t.team.id : t.team
    return {
      team: sideOfTeam(teamId, homeId),
      type: t.type,
      outcome: t.outcome,
      isLastThrow: isTerminalOutcome(t.outcome) || t.throwNumber >= allowed,
      touchedBeforeOut: t.touchedBeforeOut ?? false,
    }
  })
  const totals = reduceTotals(reducible)

  const half = match.currentHalf ?? 1
  const timeoutRes = await payload.find({
    collection: 'match-events',
    where: {
      and: [
        { match: { equals: matchId } },
        { type: { equals: 'timeout' } },
        { half: { equals: half } },
      ],
    },
    depth: 0,
    limit: 100,
  })
  const timeouts = { home: 0, away: 0 }
  for (const e of timeoutRes.docs) {
    const tId = typeof e.team === 'object' && e.team ? e.team.id : e.team
    if (tId === homeId) timeouts.home += 1
    else if (tId === awayId) timeouts.away += 1
  }

  const open = await getOpenPossession(payload, matchId)
  let possession: MatchState['possession'] = null
  if (open) {
    const teamId = typeof open.team === 'object' ? open.team.id : open.team
    const side = sideOfTeam(teamId, homeId)
    const inPoss = await payload.find({
      collection: 'throws',
      where: { possession: { equals: open.id } },
      sort: '-throwNumber',
      depth: 0,
      limit: 1,
    })
    const used = inPoss.totalDocs
    const lastThrow = inPoss.docs[0]
    const lastPlayerId = lastThrow ? (typeof lastThrow.player === 'object' ? lastThrow.player.id : lastThrow.player) : null
    possession = {
      side,
      teamId,
      setupSide: open.setupSide as SetupSide,
      throwsAllowed: open.throwsAllowed ?? 1,
      throwsUsed: used,
      nextThrowNumber: used + 1,
      dir: (open.dir as AttackDir) ?? attackDirForSide(side, half),
      lastPlayerId,
    }
  }

  return {
    match: {
      id: match.id,
      title: match.title ?? null,
      status: match.status,
      category: match.category as Category,
      currentHalf: half,
      clockSeconds: match.clockSeconds ?? 0,
      clockRunning: match.clockRunning ?? false,
      clockUpdatedAt: match.clockUpdatedAt ?? null,
    },
    teams: { home: { id: home.id, name: home.name }, away: { id: away.id, name: away.name } },
    score: totals.score,
    crosses: totals.crosses,
    timeouts,
    possession,
  }
}
