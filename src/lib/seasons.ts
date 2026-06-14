// Zuivere seizoenslogica voor de analyse (geen next/headers — veilig importeerbaar in collecties
// en de Payload-CLI). Een krachtbalseizoen loopt van het najaar (jaar N) tot het voorjaar (N+1);
// we labelen het als "N-N+1". Maanden vanaf juli horen al bij het komende seizoen (zomerstop).

/** Seizoenslabel ("2025-2026") afgeleid uit een datum. */
export function seasonFromDate(d: Date): string {
  const y = d.getFullYear()
  const start = d.getMonth() >= 6 ? y : y - 1 // juli (index 6) en later = nieuw seizoen
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
