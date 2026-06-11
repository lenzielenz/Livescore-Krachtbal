import { cookies } from 'next/headers'

import type { Payload, Where } from 'payload'

import { COMPETITIE_REEKSEN } from './reeksen'
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

/**
 * De competitiereeksen waarvoor deze gebruiker eigen analyse-data heeft: enkel reeksen met
 * minstens één eigen analyse-ploeg (binnen `scope`, meestal analyseOwnWhere). Zo toont de
 * reekskeuze in de analyse enkel de reeksen — en dus ploegen — die je effectief opgenomen hebt,
 * i.p.v. de volledige federatie-indeling: makkelijker om te zien wie en wat je hebt.
 *
 * Valt terug op álle competitiereeksen wanneer er nog geen enkele eigen ploeg is, zodat de keuze
 * nooit leeg staat en een nieuwe analist meteen een reeks kan kiezen om mee te beginnen.
 */
export async function reeksenMetData(payload: Payload, scope: Where): Promise<{ value: string; label: string }[]> {
  const res = await payload
    .find({ collection: 'teams', where: scope, depth: 0, limit: 1000, select: { reeks: true } })
    .catch(() => ({ docs: [] as { reeks?: string | null }[] }))
  const present = new Set<string>()
  for (const t of res.docs) {
    const r = (t as { reeks?: string | null }).reeks
    if (r) present.add(r)
  }
  const filtered = COMPETITIE_REEKSEN.filter((o) => present.has(o.value))
  return filtered.length ? filtered : [...COMPETITIE_REEKSEN]
}
