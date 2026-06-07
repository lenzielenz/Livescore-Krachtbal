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
