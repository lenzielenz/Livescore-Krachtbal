import type { Payload } from 'payload'

import { competitionWhere } from './analyse-access'
import { countUniqueVisitors } from './checkins'
import { buildScoreboards } from './match-engine'
import { weekendRange } from './pronostiek-weekend'
import { reeksNaam } from './reeksen'
import { seasonClause, seasonFromDate } from './seasons'
import { buildSeasonRecap, type SeasonRecap, type SeasonWeekBucket } from './season-recap'
import { readSimpleScore } from './simple-score'
import type { WeekTeamResult } from './team-of-the-week'
import type { RecapMatch, WeekendStats } from './weekly-recap'

// Verzamelt het seizoenstotaal + -archief uit de database. Zelfde patroon als weekly-recap-data.ts:
// alles wordt afgeleid uit de bestaande wedstrijddata, dus een gecorrigeerde uitslag werkt meteen
// door — er wordt niets apart bijgehouden.

const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

const teamNameOf = (v: unknown): string =>
  v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '—') : '—'

function resultOf(scored: number, conceded: number): 'win' | 'draw' | 'loss' {
  if (scored > conceded) return 'win'
  if (scored < conceded) return 'loss'
  return 'draw'
}

const rememberClub = (team: unknown, clubKeys: Set<string>) => {
  if (!team || typeof team !== 'object') return
  const club = (team as { club?: unknown }).club
  const id = rel(club)
  if (id != null) clubKeys.add(`id:${id}`)
  else if (club && typeof club === 'object') {
    const name = String((club as { name?: unknown }).name ?? '').trim()
    if (name) clubKeys.add(`name:${name}`)
  }
}

/** Bouwt het seizoenstotaal + -archief voor het seizoen waarin `now` valt. Null als het seizoen
 * nog geen afgelopen wedstrijden heeft. */
export async function buildSeasonRecapData(payload: Payload, now: Date = new Date()): Promise<SeasonRecap | null> {
  const seizoen = seasonFromDate(now)

  const seasonRes = await payload
    .find({
      collection: 'matches',
      where: {
        and: [
          { status: { equals: 'finished' } },
          // Een afgelopen wedstrijd kan niet in de toekomst liggen — een verkeerd gedateerde
          // wedstrijd (bv. een fout bij het inplannen) mag anders als eigen "speelweek" in het
          // archief opduiken, terwijl dat weekend nog moet komen.
          { date: { less_than_equal: now.toISOString() } },
          { isDemo: { not_equals: true } },
          competitionWhere(),
          ...seasonClause(seizoen),
        ],
      },
      sort: 'date',
      depth: 2,
      limit: 3000,
    })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const docs = seasonRes.docs as unknown as Record<string, unknown>[]
  if (docs.length === 0) return null

  const cards = await buildScoreboards(payload, docs as Parameters<typeof buildScoreboards>[1])

  const results: RecapMatch[] = []
  const weekBuckets = new Map<string, SeasonWeekBucket>()
  const clubKeys = new Set<string>()
  const matchIds: number[] = []
  let goalThrows = 0
  let backThrows = 0
  let reactions = 0
  let shouts = 0
  const predictorIds = new Set<number>()

  for (const m of docs) {
    const id = Number((m as { id: number }).id)
    const card = cards.get(id)
    const homeTeam = (m as { homeTeam?: unknown }).homeTeam
    const awayTeam = (m as { awayTeam?: unknown }).awayTeam
    const homeId = rel(homeTeam)
    const awayId = rel(awayTeam)
    if (!card || homeId == null || awayId == null) continue
    matchIds.push(id)
    rememberClub(homeTeam, clubKeys)
    rememberClub(awayTeam, clubKeys)

    const reeks = (m as { reeks?: string | null }).reeks ?? null
    const date = String((m as { date?: unknown }).date ?? '')
    const home = teamNameOf(homeTeam)
    const away = teamNameOf(awayTeam)
    const rm: RecapMatch = {
      matchId: id,
      date,
      reeks: reeks ? reeksNaam(reeks) : null,
      home,
      away,
      homeTeamId: homeId,
      awayTeamId: awayId,
      homeGoals: card.score.home,
      awayGoals: card.score.away,
      autoImported: Boolean((m as { autoImported?: unknown }).autoImported),
    }
    results.push(rm)

    const simple = readSimpleScore(m as { simpleScore?: unknown })
    for (const goal of simple.goals) {
      goalThrows += 1
      if (goal.points === 2) backThrows += 1
    }

    // Live tribune: emoji-tikken (cumulatieve tellers) en geschreven berichten, over het hele seizoen.
    const liveReactions = (m as { liveReactions?: unknown }).liveReactions
    if (liveReactions && typeof liveReactions === 'object') {
      for (const v of Object.values(liveReactions as Record<string, unknown>)) {
        const n = Number(v)
        if (Number.isFinite(n) && n > 0) reactions += n
      }
    }
    const liveShoutouts = (m as { liveShoutouts?: unknown }).liveShoutouts
    if (Array.isArray(liveShoutouts)) shouts += liveShoutouts.length

    // Pronostiek: unieke deelnemers over het seizoen.
    const scorePredictions = (m as { scorePredictions?: unknown }).scorePredictions
    if (Array.isArray(scorePredictions)) {
      for (const p of scorePredictions) {
        const uid = rel((p as { userId?: unknown })?.userId) ?? Number((p as { userId?: unknown })?.userId)
        if (Number.isFinite(uid) && uid! > 0) predictorIds.add(uid as number)
      }
    }

    const { startIso, endIso } = weekendRange(date)
    let bucket = weekBuckets.get(startIso)
    if (!bucket) {
      bucket = { startIso, endIso, results: [], teamResults: [] }
      weekBuckets.set(startIso, bucket)
    }
    bucket.results.push(rm)
    const teamResult = (goalsFor: number, goalsAgainst: number, teamId: number, teamName: string): WeekTeamResult => ({
      teamId,
      teamName,
      reeks: rm.reeks,
      goalsFor,
      goalsAgainst,
      result: resultOf(goalsFor, goalsAgainst),
    })
    bucket.teamResults.push(teamResult(card.score.home, card.score.away, homeId, home))
    bucket.teamResults.push(teamResult(card.score.away, card.score.home, awayId, away))
  }

  if (matchIds.length) {
    const throws = await payload
      .find({ collection: 'throws', where: { match: { in: matchIds } }, depth: 0, pagination: false, overrideAccess: true })
      .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    for (const throwDoc of throws.docs) {
      const outcome = String((throwDoc as { outcome?: unknown }).outcome ?? '')
      const scored = outcome === 'goal'
      if (scored) goalThrows += 1
      if (scored && (throwDoc as { type?: unknown }).type === 'rug') backThrows += 1
    }
  }

  const users = matchIds.length
    ? await payload
        .find({ collection: 'users', depth: 0, pagination: false, select: { checkins: true }, overrideAccess: true })
        .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    : { docs: [] as Record<string, unknown>[] }
  const visitors = countUniqueVisitors(users.docs.map((u) => (u as { checkins?: unknown }).checkins), matchIds)

  // Supportersfoto's uit de foto-tribune, over heel het seizoen.
  const photosRes = matchIds.length
    ? await payload.count({ collection: 'match-instants', where: { match: { in: matchIds } }, overrideAccess: true }).catch(() => ({ totalDocs: 0 }))
    : { totalDocs: 0 }

  const stats: Omit<WeekendStats, 'forfaits'> = {
    visitors,
    clubs: clubKeys.size,
    goalThrows,
    backThrows,
    photos: photosRes.totalDocs,
    reactions,
    shouts,
    predictors: predictorIds.size,
  }

  return buildSeasonRecap({ seizoen, results, weeks: [...weekBuckets.values()], stats })
}
