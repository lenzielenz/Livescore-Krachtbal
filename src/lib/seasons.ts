// Zuivere seizoenslogica voor de analyse (geen next/headers — veilig importeerbaar in collecties
// en de Payload-CLI). Een krachtbalseizoen loopt van het najaar (jaar N) tot het voorjaar (N+1);
// we labelen het als "N-N+1". Maanden vanaf juli horen al bij het komende seizoen (zomerstop).

import { brusselsParts } from './datetime'

/**
 * Seizoenslabel ("2025-2026") afgeleid uit een datum.
 *
 * Op de Belgische kalender, niet op die van de machine. `getFullYear()`/`getMonth()` lezen de
 * lokale kalender: op Railway is dat UTC, in de browser die van de bezoeker. Een wedstrijd op
 * 1 juli om 00:30 Belgische tijd is 30 juni 22:30 UTC — de server rekende die dus nog bij het
 * vórige seizoen, terwijl een Belgische bezoeker het nieuwe zag. Dezelfde wedstrijd, twee
 * seizoenen.
 */
export function seasonFromDate(d: Date): string {
  const { year, month } = brusselsParts(d)
  const start = month >= 7 ? year : year - 1 // juli en later = nieuw seizoen
  return `${start}-${start + 1}`
}

/** Het volgende seizoenslabel ("2025-2026" → "2026-2027"). Ongewijzigd bij een onbekend formaat. */
export function nextSeason(label: string): string {
  const m = /^(\d{4})-(\d{4})$/.exec(label)
  if (!m) return label
  return `${Number(m[1]) + 1}-${Number(m[2]) + 1}`
}

/** Where-fragment om op een seizoen te filteren (leeg = alle seizoenen). Spread in een `and`-array. */
export function seasonClause(seizoen?: string | null): { seizoen: { equals: string } }[] {
  return seizoen ? [{ seizoen: { equals: seizoen } }] : []
}

export const SEASON_COOKIE = 'analyse-seizoen'
