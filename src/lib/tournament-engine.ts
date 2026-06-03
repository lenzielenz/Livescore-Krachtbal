// Server-side tornooi-engine: maakt het schema aan, leidt de live-state af en verwerkt de
// aantekenaar-acties (start, doelpunt, undo, klok, helft, einde). De winnaar (en bij halve finales
// de verliezer) schuift bij het beëindigen automatisch door naar het volgende slot.
//
// Alle mutaties draaien met overrideAccess (server is vertrouwd), net als de match-engine.

import type { Payload } from 'payload'

import { type Category, categoryConfig } from './categories'
import {
  type Bracket,
  type Goal,
  type Side,
  type SlotRef,
  type Standing,
  buildBracket,
  buildRoundRobin,
  computeStandings,
  deriveScore,
  loserName,
  resolveWinner,
  winnerName,
} from './tournament'

export type TournamentFormat = 'knockout' | 'roundrobin'

export type TMatchState = {
  id: number
  round: number
  position: number
  bracket: Bracket
  label: string
  home: string | null
  away: string | null
  status: 'pending' | 'live' | 'finished'
  winner: Side | null
  score: { home: number; away: number }
  currentHalf: number
  clockSeconds: number
  clockRunning: boolean
}

export type TournamentState = {
  id: number
  name: string
  category: Category
  status: 'live' | 'finished'
  method: string
  format: TournamentFormat
  halfDurationSeconds: number
  rounds: { round: number; label: string; matches: TMatchState[] }[]
  thirdPlace: TMatchState | null
  champion: string | null
  /** Enkel bij round-robin: de live rangschikking. */
  standings?: Standing[]
}

type MatchDoc = {
  id: number
  round: number
  position: number
  bracket: Bracket
  label?: string | null
  home?: string | null
  away?: string | null
  status: 'pending' | 'live' | 'finished'
  winner?: Side | null
  goals?: Goal[] | null
  winnerTo?: SlotRef | null
  loserTo?: SlotRef | null
  currentHalf?: number | null
  clockSeconds?: number | null
  clockRunning?: boolean | null
  clockUpdatedAt?: string | null
}

const COLL = 'tournament-matches' as const

function goalsOf(m: Pick<MatchDoc, 'goals'>): Goal[] {
  return Array.isArray(m.goals) ? (m.goals as Goal[]) : []
}

/** Live klokstand: lopende klok telt verder vanaf clockUpdatedAt. */
function liveClock(m: Pick<MatchDoc, 'clockRunning' | 'clockUpdatedAt' | 'clockSeconds'>): number {
  const base = m.clockSeconds ?? 0
  if (!m.clockRunning || !m.clockUpdatedAt) return base
  const elapsed = (Date.now() - new Date(m.clockUpdatedAt).getTime()) / 1000
  return base + Math.max(0, elapsed)
}

function toState(m: MatchDoc): TMatchState {
  return {
    id: m.id,
    round: m.round,
    position: m.position,
    bracket: m.bracket,
    label: m.label ?? '',
    home: m.home ?? null,
    away: m.away ?? null,
    status: m.status,
    winner: m.winner ?? null,
    score: deriveScore(goalsOf(m)),
    currentHalf: m.currentHalf ?? 1,
    clockSeconds: Math.floor(liveClock(m)),
    clockRunning: Boolean(m.clockRunning),
  }
}

async function loadMatches(payload: Payload, tournamentId: number): Promise<MatchDoc[]> {
  const res = await payload.find({
    collection: COLL,
    where: { tournament: { equals: tournamentId } },
    sort: ['round', 'position'],
    depth: 0,
    limit: 500,
  })
  return res.docs as unknown as MatchDoc[]
}

/**
 * Maak een nieuw tornooi met zijn volledige schema aan vanuit een geordende slot-lijst
 * (lengte = macht van 2; null = bye). Geeft het tornooi-id terug.
 */
export async function createTournament(
  payload: Payload,
  args: { name: string; category: Category; method: 'manual' | 'auto'; slots: (string | null)[]; format?: TournamentFormat },
): Promise<number> {
  const format: TournamentFormat = args.format === 'roundrobin' ? 'roundrobin' : 'knockout'
  const filled = args.slots.filter((s): s is string => Boolean(s))
  if (filled.length < 2) throw new Error('Een tornooi heeft minstens 2 ploegen nodig.')

  const bracket = format === 'roundrobin' ? buildRoundRobin(filled) : buildBracket(args.slots)
  // Knock-out: verbied een wedstrijd zonder enige ploeg (twee bye's tegenover elkaar).
  if (format === 'knockout') {
    for (const m of bracket) {
      if (m.round === 1 && m.bracket === 'main' && !m.home && !m.away) {
        throw new Error('Ongeldige loting: een wedstrijd zonder ploegen. Verdeel de bye’s anders.')
      }
    }
  }

  const tournament = await payload.create({
    collection: 'tournaments',
    data: { name: args.name, category: args.category, method: args.method, format, status: 'live', teamCount: filled.length },
    overrideAccess: true,
  })

  // Wedstrijden in schema-volgorde aanmaken (bye-wedstrijden zijn al 'finished' met winnaar).
  for (const m of bracket) {
    await payload.create({
      collection: COLL,
      data: {
        tournament: tournament.id,
        round: m.round,
        position: m.position,
        bracket: m.bracket,
        label: m.label,
        home: m.home,
        away: m.away,
        status: m.status,
        winner: m.winner ?? undefined,
        goals: [],
        winnerTo: m.winnerTo ?? undefined,
        loserTo: m.loserTo ?? undefined,
        currentHalf: 1,
        clockSeconds: 0,
        clockRunning: false,
      },
      overrideAccess: true,
    })
  }

  return tournament.id
}

/** Volledige live-state van een tornooi voor het schema-, veld- en kantinescherm. */
export async function buildTournamentState(payload: Payload, tournamentId: number): Promise<TournamentState> {
  const t = await payload.findByID({ collection: 'tournaments', id: tournamentId, depth: 0 })
  const docs = await loadMatches(payload, tournamentId)
  const states = docs.map(toState)

  const mainByRound = new Map<number, TMatchState[]>()
  let thirdPlace: TMatchState | null = null
  for (const s of states) {
    if (s.bracket === 'third') {
      thirdPlace = s
      continue
    }
    const arr = mainByRound.get(s.round) ?? []
    arr.push(s)
    mainByRound.set(s.round, arr)
  }

  const rounds = [...mainByRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, matches]) => ({
      round,
      label: matches[0]?.label ?? `Ronde ${round}`,
      matches: matches.sort((a, b) => a.position - b.position),
    }))

  const format: TournamentFormat = (t as { format?: string }).format === 'roundrobin' ? 'roundrobin' : 'knockout'

  // Round-robin: rangschikking uit alle wedstrijden; kampioen = leider als alles gespeeld is.
  let standings: Standing[] | undefined
  let champion: string | null
  if (format === 'roundrobin') {
    const teams = [...new Set(states.flatMap((s) => [s.home, s.away]).filter((n): n is string => Boolean(n)))]
    standings = computeStandings(states, teams)
    champion = t.status === 'finished' ? (standings[0]?.team ?? null) : null
  } else {
    const finalRound = rounds[rounds.length - 1]
    const finalMatch = finalRound?.matches.find((m) => m.bracket === 'main')
    champion = finalMatch?.status === 'finished' && finalMatch.winner ? finalMatch[finalMatch.winner] : null
  }

  return {
    id: t.id,
    name: t.name as string,
    category: t.category as Category,
    status: t.status as 'live' | 'finished',
    method: (t.method as string) ?? 'auto',
    format,
    halfDurationSeconds: categoryConfig(t.category as Category).halfDurationSeconds,
    rounds,
    thirdPlace,
    champion,
    standings,
  }
}

async function getMatch(payload: Payload, matchId: number): Promise<MatchDoc> {
  return (await payload.findByID({ collection: COLL, id: matchId, depth: 0 })) as unknown as MatchDoc
}

async function update(payload: Payload, matchId: number, data: Partial<MatchDoc>): Promise<void> {
  await payload.update({ collection: COLL, id: matchId, data: data as Record<string, unknown>, overrideAccess: true })
}

/** Start (of hervat) een wedstrijd: beide ploegen moeten gekend zijn. */
export async function startMatch(payload: Payload, matchId: number): Promise<void> {
  const m = await getMatch(payload, matchId)
  if (!m.home || !m.away) throw new Error('Beide ploegen moeten gekend zijn voor de start.')
  if (m.status === 'finished') throw new Error('Deze wedstrijd is al afgelopen.')
  await update(payload, matchId, {
    status: 'live',
    clockRunning: true,
    clockUpdatedAt: new Date().toISOString(),
  })
}

/** Registreer een doelpunt: nekworp = 1, rugworp = 2 (telt dubbel). */
export async function recordGoal(payload: Payload, matchId: number, side: Side, points: 1 | 2): Promise<void> {
  const m = await getMatch(payload, matchId)
  if (m.status === 'finished') throw new Error('Deze wedstrijd is al afgelopen.')
  const goals = goalsOf(m)
  goals.push({ side, points, half: m.currentHalf ?? 1, clock: Math.floor(liveClock(m)), ts: Date.now() })
  await update(payload, matchId, { goals, status: m.status === 'pending' ? 'live' : m.status })
}

/** Neem het laatste doelpunt terug (vangnet). */
export async function undoGoal(payload: Payload, matchId: number): Promise<void> {
  const m = await getMatch(payload, matchId)
  const goals = goalsOf(m)
  goals.pop()
  await update(payload, matchId, { goals })
}

/** Klok starten/pauzeren of de tijd zetten. Bij pauzeren wordt de verstreken tijd vastgeklikt. */
export async function setClock(
  payload: Payload,
  matchId: number,
  opts: { running?: boolean; seconds?: number },
): Promise<void> {
  const m = await getMatch(payload, matchId)
  const data: Partial<MatchDoc> = {}
  const base = opts.seconds !== undefined ? Math.max(0, opts.seconds) : Math.floor(liveClock(m))
  data.clockSeconds = base
  if (opts.running !== undefined) {
    data.clockRunning = opts.running
    data.clockUpdatedAt = new Date().toISOString()
  } else if (m.clockRunning) {
    // Tijd handmatig gezet terwijl de klok loopt → herijk het startpunt.
    data.clockUpdatedAt = new Date().toISOString()
  }
  await update(payload, matchId, data)
}

/** Naar de tweede helft: klok terug op 0, gepauzeerd. */
export async function advanceHalf(payload: Payload, matchId: number): Promise<void> {
  await update(payload, matchId, {
    currentHalf: 2,
    clockSeconds: 0,
    clockRunning: false,
    clockUpdatedAt: new Date().toISOString(),
  })
}

/**
 * Beëindig een wedstrijd: bepaal de winnaar (uit de stand, of expliciet bij gelijkspel) en schuif
 * winnaar (en bij een halve finale de verliezer) door naar het volgende slot.
 */
export async function finishMatch(payload: Payload, matchId: number, explicitWinner?: Side | null): Promise<void> {
  const m = await getMatch(payload, matchId)
  const score = deriveScore(goalsOf(m))
  const tournamentId = await tournamentIdOf(payload, m)
  const t = await payload.findByID({ collection: 'tournaments', id: tournamentId, depth: 0 }).catch(() => null)
  const format = (t as { format?: string } | null)?.format === 'roundrobin' ? 'roundrobin' : 'knockout'

  const winner = resolveWinner(score, explicitWinner)
  // In een afvalrace moet er een winnaar zijn (extra worpen bij gelijkspel). Bij round-robin
  // mag een wedstrijd op een gelijkspel eindigen (3 punten elk).
  if (!winner && format === 'knockout') {
    throw new Error('Gelijkspel: kies wie doorgaat (extra worpen).')
  }

  await update(payload, matchId, { status: 'finished', winner, clockRunning: false, clockSeconds: Math.floor(liveClock(m)) })

  const champ = winnerName({ home: m.home ?? null, away: m.away ?? null, winner })
  const loser = loserName({ home: m.home ?? null, away: m.away ?? null, winner })
  if (m.winnerTo && champ) await applyToSlot(payload, m, m.winnerTo, champ)
  if (m.loserTo && loser) await applyToSlot(payload, m, m.loserTo, loser)

  // Tornooi afsluiten zodra alle wedstrijden gespeeld zijn.
  const docs = await loadMatches(payload, tournamentId)
  if (docs.every((d) => d.status === 'finished')) {
    await payload.update({ collection: 'tournaments', id: tournamentId, data: { status: 'finished' }, overrideAccess: true })
  }
}

async function tournamentIdOf(payload: Payload, m: MatchDoc): Promise<number> {
  const full = (await payload.findByID({ collection: COLL, id: m.id, depth: 0 })) as unknown as {
    tournament: number | { id: number }
  }
  return typeof full.tournament === 'object' ? full.tournament.id : full.tournament
}

/** Schrijf een ploegnaam in het doel-slot (volgende ronde / kleine finale). */
async function applyToSlot(payload: Payload, source: MatchDoc, ref: SlotRef, name: string): Promise<void> {
  const tournamentId = await tournamentIdOf(payload, source)
  const res = await payload.find({
    collection: COLL,
    where: {
      and: [
        { tournament: { equals: tournamentId } },
        { round: { equals: ref.round } },
        { position: { equals: ref.position } },
        { bracket: { equals: ref.bracket } },
      ],
    },
    depth: 0,
    limit: 1,
  })
  const target = res.docs[0]
  if (target) await update(payload, target.id as number, { [ref.slot]: name } as Partial<MatchDoc>)
}
