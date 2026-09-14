import type { Payload } from 'payload'

import { competitionWhere } from './analyse-access'
import { buildMatchStats, buildScoreboards } from './match-engine'
import { reeksNaam } from './reeksen'
import { seasonClause, seasonFromDate } from './seasons'
import { readSimpleScore } from './simple-score'
import { computeStandings, type StandingsMatch } from './standings'
import { buildTeamOfTheWeek, teamOfTheWeek, type WeekPlayer, type WeekTeamResult } from './team-of-the-week'
import { buildWeeklyRecap, positionDeltas, previousWeekRange, type Climber, type RecapMatch, type WeeklyRecap } from './weekly-recap'

// Verzamelt de data voor de maandag-recap uit de database en geeft ze aan de pure opbouw
// (weekly-recap.ts). Alles wordt AFGELEID uit de bestaande wedstrijd-/worpdata — er wordt geen
// recap opgeslagen, zodat een gecorrigeerde uitslag meteen doorwerkt in het overzicht.
//
// Zwaarte: per wedstrijd van de voorbije week wordt één keer de spelersstatistiek opgebouwd.
// Daarom een harde bovengrens (MAX_STAT_MATCHES) — bij een uitzonderlijk vol weekend vallen de
// spelerscijfers terug op de eerste wedstrijden i.p.v. de pagina te laten crashen.
const MAX_STAT_MATCHES = 60

const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

const teamNameOf = (v: unknown): string =>
  v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '—') : '—'

const clubNameOf = (v: unknown): string | null => {
  const club = (v as { club?: unknown })?.club
  return club && typeof club === 'object' ? ((club as { name?: string }).name ?? null) : null
}

function resultOf(scored: number, conceded: number): 'win' | 'draw' | 'loss' {
  if (scored > conceded) return 'win'
  if (scored < conceded) return 'loss'
  return 'draw'
}

/**
 * Bouwt de recap van de vorige speelweek (of van het venster dat je meegeeft).
 * Geeft altijd een geldige recap terug — een week zonder wedstrijden levert een lege recap op.
 */
export async function buildWeeklyRecapData(
  payload: Payload,
  opts: { now?: Date; range?: { startIso: string; endIso: string } } = {},
): Promise<WeeklyRecap> {
  const { startIso, endIso } = opts.range ?? previousWeekRange(opts.now ?? new Date())

  const weekRes = await payload
    .find({
      collection: 'matches',
      where: {
        and: [
          { status: { equals: 'finished' } },
          { date: { greater_than_equal: startIso } },
          { date: { less_than: endIso } },
          { isDemo: { not_equals: true } },
          competitionWhere(),
        ],
      },
      sort: 'date',
      depth: 2,
      limit: 500,
    })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))

  const weekDocs = weekRes.docs as unknown as Record<string, unknown>[]
  if (weekDocs.length === 0) {
    return buildWeeklyRecap({ startIso, endIso, results: [], team: null, players: [], climbers: [] })
  }

  const cards = await buildScoreboards(payload, weekDocs as Parameters<typeof buildScoreboards>[1])

  const results: RecapMatch[] = []
  const teamResults: WeekTeamResult[] = []
  for (const m of weekDocs) {
    const id = Number((m as { id: number }).id)
    const card = cards.get(id)
    const homeId = rel((m as { homeTeam?: unknown }).homeTeam)
    const awayId = rel((m as { awayTeam?: unknown }).awayTeam)
    if (!card || homeId == null || awayId == null) continue
    const reeks = (m as { reeks?: string | null }).reeks ?? null
    const home = teamNameOf((m as { homeTeam?: unknown }).homeTeam)
    const away = teamNameOf((m as { awayTeam?: unknown }).awayTeam)
    results.push({
      matchId: id,
      date: String((m as { date?: unknown }).date ?? ''),
      reeks: reeks ? reeksNaam(reeks) : null,
      home,
      away,
      homeTeamId: homeId,
      awayTeamId: awayId,
      homeGoals: card.score.home,
      awayGoals: card.score.away,
    })
    teamResults.push({
      teamId: homeId,
      teamName: home,
      reeks: reeks ? reeksNaam(reeks) : null,
      goalsFor: card.score.home,
      goalsAgainst: card.score.away,
      result: resultOf(card.score.home, card.score.away),
    })
    teamResults.push({
      teamId: awayId,
      teamName: away,
      reeks: reeks ? reeksNaam(reeks) : null,
      goalsFor: card.score.away,
      goalsAgainst: card.score.home,
      result: resultOf(card.score.away, card.score.home),
    })
  }

  const stats = await collectWeekendStats(payload, weekDocs)
  const players = await collectWeekPlayers(payload, weekDocs, cards)
  const climbers = await collectClimbers(payload, weekDocs, startIso, endIso)

  return buildWeeklyRecap({
    startIso,
    endIso,
    results,
    team: teamOfTheWeek(teamResults),
    players: buildTeamOfTheWeek(players),
    climbers,
    stats,
  })
}

async function collectWeekendStats(payload: Payload, weekDocs: Record<string, unknown>[]) {
  const playerIds = new Set<number>()
  const clubKeys = new Set<string>()
  const matchIds = weekDocs.map((match) => Number((match as { id?: unknown }).id)).filter(Number.isFinite)
  let goalThrows = 0
  let backThrows = 0

  const rememberRelation = (set: Set<number>, value: unknown) => {
    const id = rel(value)
    if (id != null && Number.isFinite(id)) set.add(id)
  }
  const rememberClub = (team: unknown) => {
    if (!team || typeof team !== 'object') return
    const club = (team as { club?: unknown }).club
    const id = rel(club)
    if (id != null) clubKeys.add(`id:${id}`)
    else if (club && typeof club === 'object') {
      const name = String((club as { name?: unknown }).name ?? '').trim()
      if (name) clubKeys.add(`name:${name}`)
    }
  }

  for (const match of weekDocs) {
    rememberClub((match as { homeTeam?: unknown }).homeTeam)
    rememberClub((match as { awayTeam?: unknown }).awayTeam)
    for (const value of [
      ...(((match as { homeLineup?: unknown }).homeLineup as unknown[]) ?? []),
      ...(((match as { awayLineup?: unknown }).awayLineup as unknown[]) ?? []),
    ]) rememberRelation(playerIds, value)

    const simple = readSimpleScore(match as { simpleScore?: unknown })
    for (const goal of simple.goals) {
      if (goal.scorerId != null) rememberRelation(playerIds, goal.scorerId)
      goalThrows += 1
      if (goal.points === 2) backThrows += 1
    }
  }

  if (matchIds.length) {
    const throws = await payload.find({
      collection: 'throws',
      where: { match: { in: matchIds } },
      depth: 0,
      limit: 10_000,
      overrideAccess: true,
    }).catch(() => ({ docs: [] as Record<string, unknown>[] }))
    for (const throwDoc of throws.docs) {
      rememberRelation(playerIds, (throwDoc as { player?: unknown }).player)
      const outcome = String((throwDoc as { outcome?: unknown }).outcome ?? '')
      const scored = outcome === 'goal' || outcome === 'own_goal'
      if (scored) goalThrows += 1
      if (scored && (throwDoc as { type?: unknown }).type === 'rug') backThrows += 1
    }
  }

  return { participants: playerIds.size, clubs: clubKeys.size, goalThrows, backThrows }
}

/** Spelersprestaties van de week: uit de worpstatistiek én uit de snelscoremodus. */
async function collectWeekPlayers(
  payload: Payload,
  weekDocs: Record<string, unknown>[],
  cards: Awaited<ReturnType<typeof buildScoreboards>>,
): Promise<WeekPlayer[]> {
  const out: WeekPlayer[] = []

  for (const m of weekDocs.slice(0, MAX_STAT_MATCHES)) {
    const id = Number((m as { id: number }).id)
    const card = cards.get(id)
    if (!card) continue
    const homeTeam = (m as { homeTeam?: unknown }).homeTeam
    const awayTeam = (m as { awayTeam?: unknown }).awayTeam
    const homeId = rel(homeTeam)
    const awayId = rel(awayTeam)
    if (homeId == null || awayId == null) continue
    const reeks = (m as { reeks?: string | null }).reeks ?? null
    const side = (s: 'home' | 'away') => ({
      teamId: s === 'home' ? homeId : awayId,
      teamName: teamNameOf(s === 'home' ? homeTeam : awayTeam),
      clubName: clubNameOf(s === 'home' ? homeTeam : awayTeam),
      result: resultOf(s === 'home' ? card.score.home : card.score.away, s === 'home' ? card.score.away : card.score.home),
    })

    // Veldschema-wedstrijd: de volledige statistiek per speler.
    const statsRes = await buildMatchStats(payload, id).catch(() => null)
    for (const p of statsRes?.stats.players ?? []) {
      if (p.goals.total === 0 && p.lost === 0) continue
      const s = side(p.teamSide)
      out.push({
        playerId: p.playerId,
        name: p.playerName,
        shirtNumber: p.shirtNumber ?? null,
        reeks: reeks ? reeksNaam(reeks) : null,
        goals: p.goals.total,
        points: p.goals.points,
        conversion: p.conversion,
        lost: p.lost,
        ...s,
      })
    }

    // Snelscoremodus: geen worpen, wel doelpunten op naam. Die tellen ook mee.
    if (!statsRes || statsRes.stats.players.length === 0) {
      const simple = readSimpleScore(m as { simpleScore?: unknown })
      const by = new Map<number, WeekPlayer>()
      for (const g of simple.goals) {
        const pid = Number(g.scorerId)
        if (!Number.isFinite(pid) || pid <= 0) continue
        const s = side(g.side)
        const entry = by.get(pid) ?? {
          playerId: pid,
          name: String(g.scorerName ?? 'Speler'),
          shirtNumber: typeof g.scorerNumber === 'number' ? g.scorerNumber : null,
          reeks: reeks ? reeksNaam(reeks) : null,
          goals: 0,
          points: 0,
          conversion: 0,
          lost: 0,
          ...s,
        }
        entry.goals += 1
        entry.points += g.points
        by.set(pid, entry)
      }
      out.push(...by.values())
    }
  }
  return out
}

/** Wie klom er in zijn reeks? Vergelijkt de stand vóór en ná de speelweek. */
async function collectClimbers(
  payload: Payload,
  weekDocs: Record<string, unknown>[],
  startIso: string,
  endIso: string,
): Promise<Climber[]> {
  const reeksen = [...new Set(weekDocs.map((m) => (m as { reeks?: string | null }).reeks).filter((r): r is string => Boolean(r)))]
  if (reeksen.length === 0) return []
  const seizoen = seasonFromDate(new Date(startIso))

  // Alle afgelopen wedstrijden van het seizoen in die reeksen — één query, één gebatchte opbouw.
  const seasonRes = await payload
    .find({
      collection: 'matches',
      where: {
        and: [
          { reeks: { in: reeksen } },
          { status: { equals: 'finished' } },
          { date: { less_than: endIso } },
          { isDemo: { not_equals: true } },
          competitionWhere(),
          ...seasonClause(seizoen),
        ],
      },
      sort: 'date',
      depth: 2,
      limit: 2000,
    })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  if (seasonRes.docs.length === 0) return []

  const seasonCards = await buildScoreboards(payload, seasonRes.docs as Parameters<typeof buildScoreboards>[1])

  // Per reeks de wedstrijden verzamelen, met datum zodat we op het weekvenster kunnen splitsen.
  const byReeks = new Map<string, (StandingsMatch & { date: string })[]>()
  const teamNames = new Map<number, string>()
  for (const m of seasonRes.docs) {
    const id = Number((m as { id: number }).id)
    const card = seasonCards.get(id)
    const reeks = (m as { reeks?: string | null }).reeks
    const homeId = rel((m as { homeTeam?: unknown }).homeTeam)
    const awayId = rel((m as { awayTeam?: unknown }).awayTeam)
    if (!card || !reeks || homeId == null || awayId == null) continue
    teamNames.set(homeId, teamNameOf((m as { homeTeam?: unknown }).homeTeam))
    teamNames.set(awayId, teamNameOf((m as { awayTeam?: unknown }).awayTeam))
    const arr = byReeks.get(reeks) ?? []
    arr.push({
      homeId,
      awayId,
      homeGoals: card.score.home,
      awayGoals: card.score.away,
      // Forfaits blijven hier buiten beschouwing: voor "wie klom" volstaat de gespeelde uitslag.
      forfait: 'none',
      date: String((m as { date?: unknown }).date ?? ''),
    })
    byReeks.set(reeks, arr)
  }

  const climbers: Climber[] = []
  for (const [reeks, matches] of byReeks) {
    const before = computeStandings(matches.filter((m) => m.date < startIso))
    const after = computeStandings(matches)
    if (before.length === 0) continue // eerste speeldag: iedereen is "nieuw", dus geen klimmers
    positionDeltas(before, after).forEach((d, teamId) => {
      if (d.delta <= 0) return
      climbers.push({
        teamId,
        teamName: teamNames.get(teamId) ?? '—',
        reeks: reeksNaam(reeks),
        from: d.from,
        to: d.to,
        delta: d.delta,
      })
    })
  }
  return climbers
}
