// "Zet in Google Agenda" — een kant-en-klare link naar het aanmaakscherm van Google Calendar.
//
// Twee manieren om een wedstrijd in je agenda te krijgen, elk met een eigen sterkte:
//  • deze link: één klik, alles al ingevuld, werkt overal waar je met je Google-account inlogt.
//    Google zet er wél zijn eigen standaardmelding op — je kan er geen meegeven in de link.
//  • het .ics-bestand: draagt de melding zélf mee (VALARM, zie match-ics.ts) en werkt ook in
//    Apple Agenda en Outlook.
//
// Daarom bieden we ze allebei aan i.p.v. te kiezen.

import { toIcsUtc } from './match-ics'

export interface GoogleEventInput {
  title: string
  startIso: string
  /** Duur in minuten (default 120: een krachtbalwedstrijd met opwarming en nabespreking). */
  durationMin?: number
  location?: string | null
  details?: string | null
}

/**
 * Bouwt de "template"-URL van Google Agenda. Geeft een lege string terug bij een onbruikbare
 * datum — dan tonen we de knop gewoon niet in plaats van naar een kapotte pagina te sturen.
 */
export function googleCalendarUrl(o: GoogleEventInput): string {
  const start = new Date(o.startIso)
  if (Number.isNaN(start.getTime())) return ''
  const end = new Date(start.getTime() + (o.durationMin ?? 120) * 60_000)

  const p = new URLSearchParams()
  p.set('action', 'TEMPLATE')
  p.set('text', o.title)
  // Google verwacht "start/eind" in UTC-basisvorm, precies zoals in een ics-bestand.
  p.set('dates', `${toIcsUtc(start)}/${toIcsUtc(end)}`)
  if (o.location) p.set('location', o.location)
  if (o.details) p.set('details', o.details)
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}
