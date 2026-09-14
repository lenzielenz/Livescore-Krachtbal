export const MATCH_START_EARLY_MS = 30 * 60 * 1000

/**
 * Hoeveel seconden de wedstrijd volgens het geplande aanvangsuur al bezig is.
 * Vóór de aftrap, bij demo's of bij een ongeldig uur starten we veilig op nul.
 */
export function elapsedSinceScheduledStart(
  match: { date?: unknown; isDemo?: boolean | null },
  now = new Date(),
): number {
  if (match.isDemo) return 0
  const scheduledAt = new Date(String(match.date ?? '')).getTime()
  if (!Number.isFinite(scheduledAt)) return 0
  return Math.max(0, Math.floor((now.getTime() - scheduledAt) / 1000))
}

/**
 * Een echte wedstrijd kan pas vanaf 30 minuten vóór het geplande uur gestart worden.
 * Demo's blijven altijd bruikbaar voor uitleg en opleiding.
 */
export function matchStartBlockedReason(
  match: { date?: unknown; isDemo?: boolean | null },
  now = new Date(),
): string | null {
  if (match.isDemo) return null
  const scheduledAt = new Date(String(match.date ?? ''))
  if (!Number.isFinite(scheduledAt.getTime())) return 'Deze wedstrijd heeft geen geldig startuur.'
  const opensAt = scheduledAt.getTime() - MATCH_START_EARLY_MS
  if (now.getTime() >= opensAt) return null
  const time = new Intl.DateTimeFormat('nl-BE', {
    timeZone: 'Europe/Brussels',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(opensAt))
  return `Aantekenen kan vanaf ${time}, een half uur vóór de geplande start.`
}
