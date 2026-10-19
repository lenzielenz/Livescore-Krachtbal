import type { Payload } from 'payload'

import { aanwezigheidStats } from './badges'
import type { Checkin } from './checkins'

// Laadt de wedstrijden achter je check-ins (datum + club van beide ploegen) voor de zwaardere
// aanwezigheidsbadges: uitwedstrijden, verschillende terreinen en weken op rij (zie badges.ts).
// Gedeeld door /profiel/badges en /wrapped, zodat beide hetzelfde aantal badges tonen.

const relId = (rel: unknown): number | null => {
  const raw = rel && typeof rel === 'object' ? (rel as { id?: unknown }).id : rel
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

export async function aanwezigheidVoorBadges(
  payload: Payload,
  checkins: Checkin[],
  eigenClubId: number | null,
): Promise<{ awayCheckins: number; grounds: number; weekStreak: number }> {
  const ids = checkins.map((c) => c.m)
  if (ids.length === 0) return { awayCheckins: 0, grounds: 0, weekStreak: 0 }
  const res = await payload
    .find({ collection: 'matches', where: { id: { in: ids } }, depth: 1, limit: ids.length, overrideAccess: true })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const matches = res.docs
    .filter((m) => !(m as { isDemo?: boolean }).isDemo && !(m as { analyseOnly?: boolean }).analyseOnly)
    .map((m) => {
      const home = (m as { homeTeam?: unknown }).homeTeam
      const away = (m as { awayTeam?: unknown }).awayTeam
      return {
        date: String((m as { date?: unknown }).date ?? ''),
        // Een ploeg zonder club telt als haar eigen "terrein".
        homeClubId: relId(home && typeof home === 'object' ? (home as { club?: unknown }).club : null) ?? relId(home),
        awayClubId: relId(away && typeof away === 'object' ? (away as { club?: unknown }).club : null),
      }
    })
  return aanwezigheidStats(matches, eigenClubId)
}
