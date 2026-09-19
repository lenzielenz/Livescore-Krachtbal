import { dateStrBE } from './datetime'

// De live tribune (emoji-reacties + shoutouts) staat open vanaf de speeldag zelf (niet pas
// wanneer de aantekenaar effectief start) tot één uur ná het einde. Zo kunnen supporters al
// meedoen terwijl ze wachten op de aftrap, i.p.v. een lege pagina te zien. Eén bron van waarheid
// voor zowel de client (scorebord) als de server (live-kanaal), zodat tonen en toelaten altijd
// gelijklopen.
export const TRIBUNE_GRACE_MS = 60 * 60 * 1000 // 1 uur na de wedstrijd

// Een uur vóór de aftrap: vanaf dan mag je al klaarzetten wat aan de wedstrijd hangt, ook al is
// ze nog niet gestart — het veldscherm koppelen en een eerste foto plaatsen (bv. van het volle
// terrein vóór de aftrap). Bewust losstaand van isTribuneOpen hierboven (dat blijft de hele
// speeldag open voor reacties/chat): dit venster is korter en geldt specifiek voor deze twee.
export const PRE_MATCH_LEAD_MS = 60 * 60 * 1000 // 1 uur vóór de aftrap

export function isPreMatchLead(date: string | null | undefined, now: number = Date.now()): boolean {
  if (!date) return false
  const kickoff = new Date(date).getTime()
  if (Number.isNaN(kickoff)) return false
  return now >= kickoff - PRE_MATCH_LEAD_MS
}

export function isTribuneOpen(
  status: string | null | undefined,
  finishedAt: string | null | undefined,
  date?: string | null,
  now: number = Date.now(),
): boolean {
  if (status === 'live') return true
  if (status === 'finished') {
    if (!finishedAt) return false // afgelopen zonder bekend eindtijdstip → gesloten
    const t = new Date(finishedAt).getTime()
    if (Number.isNaN(t)) return false
    return now - t < TRIBUNE_GRACE_MS
  }
  if (status === 'scheduled' && date) {
    const kickoff = new Date(date)
    if (Number.isNaN(kickoff.getTime())) return false
    return dateStrBE(kickoff) === dateStrBE(new Date(now))
  }
  return false // gepland zonder (geldige) datum, of onbekende status → gesloten
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
