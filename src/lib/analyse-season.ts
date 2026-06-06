import { cookies } from 'next/headers'

import type { Payload } from 'payload'

import { SEASON_COOKIE } from './seasons'

// Server-only helpers voor het globaal gekozen analyse-seizoen (cookie). Apart van seasons.ts
// zodat de pure logica (en de Matches-collectie) geen next/headers binnentrekt.

/** Het door de gebruiker gekozen seizoen (cookie), of null = alle seizoenen. */
export async function getSelectedSeason(): Promise<string | null> {
  const v = (await cookies()).get(SEASON_COOKIE)?.value
  return v && v !== 'all' ? v : null
}

/** Alle seizoenen waarvoor er afgelopen wedstrijden bestaan (nieuwste eerst). */
export async function listSeasons(payload: Payload): Promise<string[]> {
  const res = await payload
    .find({ collection: 'matches', where: { status: { equals: 'finished' } }, depth: 0, limit: 5000, select: { seizoen: true } })
    .catch(() => ({ docs: [] as { seizoen?: string | null }[] }))
  const set = new Set<string>()
  for (const m of res.docs) {
    const s = (m as { seizoen?: string | null }).seizoen
    if (s) set.add(s)
  }
  return [...set].sort().reverse()
}
