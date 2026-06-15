// De live tribune (emoji-reacties + shoutouts) staat open tijdens de wedstrijd en nog tot
// één uur ná het einde. Daarna sluit ze. Eén bron van waarheid voor zowel de client (scorebord)
// als de server (live-kanaal), zodat tonen en toelaten altijd gelijklopen.
export const TRIBUNE_GRACE_MS = 60 * 60 * 1000 // 1 uur na de wedstrijd

export function isTribuneOpen(
  status: string | null | undefined,
  finishedAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (status === 'live') return true
  if (status === 'finished') {
    if (!finishedAt) return false // afgelopen zonder bekend eindtijdstip → gesloten
    const t = new Date(finishedAt).getTime()
    if (Number.isNaN(t)) return false
    return now - t < TRIBUNE_GRACE_MS
  }
  return false // gepland / onbekend → nog niet open
}

// Wanneer een tribunefoto moet verdwijnen: één uur ná de wedstrijd. Is de eindtijd al bekend, dan
// rekenen we exact vanaf finishedAt; loopt de match nog, dan schatten we het einde uit de aftrap
// (2 helften + pauzes/time-outs) zodat een vroege foto de match zeker overleeft. Geeft een tijdstip
// in ms. Bij het beëindigen wordt dit nog exact gezet (finishedAt + 1u).
export function tribuneExpiresAt(
  opts: { status?: string | null; finishedAt?: string | null; date?: string | null },
  halfSeconds: number,
  now: number = Date.now(),
): number {
  if (opts.finishedAt) {
    const t = new Date(opts.finishedAt).getTime()
    if (!Number.isNaN(t)) return t + TRIBUNE_GRACE_MS
  }
  if (opts.date) {
    const start = new Date(opts.date).getTime()
    if (!Number.isNaN(start)) {
      const estEnd = start + halfSeconds * 2 * 1000 + halfSeconds * 0.6 * 1000
      return Math.max(estEnd, now) + TRIBUNE_GRACE_MS
    }
  }
  return now + TRIBUNE_GRACE_MS
}
