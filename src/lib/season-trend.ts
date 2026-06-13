import type { Payload, Where } from 'payload'

import { seasonFromDate } from './seasons'
import { buildTeamReport } from './team-report'

// Meerjaren-trend: de groeicurve van een ploeg over de seizoenen heen (punten per match + conversie).
// Hergebruikt buildTeamReport per seizoen (beperkt tot de recentste seizoenen voor de kost).

export interface SeasonTrendPoint {
  season: string
  matches: number
  pointsPerMatch: number
  conversion: number
  goals: number
  avgDistance: number
}

const MAX_SEASONS = 4

export async function buildTeamSeasonTrend(payload: Payload, teamId: number, matchFilter?: Where | null): Promise<SeasonTrendPoint[]> {
  const matchRes = await payload
    .find({
      collection: 'matches',
      where: {
        and: [
          { status: { equals: 'finished' } },
          { or: [{ homeTeam: { equals: teamId } }, { awayTeam: { equals: teamId } }] },
          ...(matchFilter ? [matchFilter] : []),
        ],
      },
      depth: 0,
      limit: 1000,
    })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))

  // Seizoenen uit het seizoen-veld (val terug op de datum als het ontbreekt).
  const seasons = [
    ...new Set(
      matchRes.docs
        .filter((m) => !(m as { isDemo?: boolean }).isDemo)
        .map((m) => {
          const s = (m as { seizoen?: unknown }).seizoen
          if (typeof s === 'string' && s) return s
          const d = (m as { date?: unknown }).date
          return d ? seasonFromDate(new Date(d as string)) : null
        })
        .filter((s): s is string => Boolean(s)),
    ),
  ].sort()
  const recent = seasons.slice(-MAX_SEASONS)
  if (recent.length < 2) return []

  const reports = await Promise.all(recent.map((s) => buildTeamReport(payload, teamId, s, matchFilter).catch(() => null)))

  const out: SeasonTrendPoint[] = []
  recent.forEach((season, i) => {
    const r = reports[i]
    if (!r || r.matchesAnalyzed === 0) return
    out.push({
      season,
      matches: r.matchesAnalyzed,
      pointsPerMatch: Math.round((r.totals.points / r.matchesAnalyzed) * 10) / 10,
      conversion: r.totals.conversion,
      goals: r.totals.goals,
      avgDistance: r.totals.avgDistance,
    })
  })
  return out
}
