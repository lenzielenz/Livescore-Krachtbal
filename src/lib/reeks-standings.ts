import type { Payload } from 'payload'

import { competitionWhere } from './analyse-access'
import { buildScoreboards } from './match-engine'
import { computeStandings, forfaitFromUitslag, type StandingRow, type StandingsMatch } from './standings'

// Bouwt de actuele stand én het aantal resterende wedstrijden per ploeg voor één reeks. Gedeeld
// door de rangschikking-/kampioenschapslogica.

const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

export async function buildReeksStandings(payload: Payload, reeks: string): Promise<{ standings: StandingRow[]; remaining: Map<number, number> }> {
  const teamsRes = await payload
    .find({ collection: 'teams', where: { and: [{ reeks: { equals: reeks } }, competitionWhere()] }, depth: 0, limit: 200 })
    .catch(() => ({ docs: [] as { id: number }[] }))
  const teamIds = teamsRes.docs.map((t) => Number(t.id))

  const finishedRes = await payload
    .find({ collection: 'matches', where: { and: [{ reeks: { equals: reeks } }, { status: { equals: 'finished' } }, { analyseOnly: { not_equals: true } }] }, depth: 0, limit: 1000 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const finished = finishedRes.docs.filter((m) => !(m as { isDemo?: boolean }).isDemo)
  const cards = await buildScoreboards(payload, finished as Parameters<typeof buildScoreboards>[1])

  const matchIds = finished.map((m) => (m as { id: number }).id)
  const sheetsRes = matchIds.length
    ? await payload.find({ collection: 'matchsheets', where: { match: { in: matchIds } }, depth: 0, pagination: false }).catch(() => ({ docs: [] as Record<string, unknown>[] }))
    : { docs: [] as Record<string, unknown>[] }
  const ffByMatch = new Map<number, string>()
  for (const s of sheetsRes.docs) {
    const mid = rel((s as { match?: unknown }).match)
    const u = (s as { forfait?: { uitslag?: string } }).forfait?.uitslag
    if (mid != null && u) ffByMatch.set(mid, u)
  }

  const standingsMatches: StandingsMatch[] = []
  for (const m of finished) {
    const id = (m as { id: number }).id
    const c = cards.get(id)
    if (!c) continue
    const homeId = rel((m as { homeTeam?: unknown }).homeTeam)
    const awayId = rel((m as { awayTeam?: unknown }).awayTeam)
    if (homeId == null || awayId == null) continue
    standingsMatches.push({ homeId, awayId, homeGoals: c.score.home, awayGoals: c.score.away, forfait: forfaitFromUitslag(ffByMatch.get(id)) })
  }
  const standings = computeStandings(standingsMatches, teamIds)

  // Resterende (nog te spelen) wedstrijden per ploeg.
  const remRes = await payload
    .find({ collection: 'matches', where: { and: [{ reeks: { equals: reeks } }, { status: { in: ['scheduled', 'live'] } }, { analyseOnly: { not_equals: true } }] }, depth: 0, limit: 1000 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const remaining = new Map<number, number>()
  for (const m of remRes.docs) {
    if ((m as { isDemo?: boolean }).isDemo) continue
    for (const tid of [rel((m as { homeTeam?: unknown }).homeTeam), rel((m as { awayTeam?: unknown }).awayTeam)]) {
      if (tid != null) remaining.set(Number(tid), (remaining.get(Number(tid)) ?? 0) + 1)
    }
  }
  return { standings, remaining }
}
