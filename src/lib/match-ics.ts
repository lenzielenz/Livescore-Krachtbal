// ── iCalendar (.ics) voor een wedstrijd ────────────────────────────────────────────────────────
// Laat supporters een wedstrijd in hun agenda (Google/Apple/Outlook) zetten — een functie die de
// grote live-score/teamapps standaard bieden. Pure functies → los testbaar.

/** Tekst veilig maken voor een ICS-waarde (RFC 5545: \ ; , en nieuwe regels escapen). */
export function icsEscape(s: string): string {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** Een instant als UTC-tijdstempel in ICS-vorm: YYYYMMDDTHHMMSSZ. */
export function toIcsUtc(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
}

/** Lange regels vouwen (RFC 5545): max ~73 tekens, vervolgregels beginnen met een spatie. */
function fold(line: string): string {
  const max = 73
  if (line.length <= max) return line
  let out = line.slice(0, max)
  let rest = line.slice(max)
  while (rest.length > max - 1) {
    out += '\r\n ' + rest.slice(0, max - 1)
    rest = rest.slice(max - 1)
  }
  return out + '\r\n ' + rest
}

export interface MatchIcsInput {
  id: number | string
  home: string
  away: string
  reeks?: string | null
  startIso: string
  /** Duur in minuten (default 120). */
  durationMin?: number
  location?: string | null
  url?: string | null
  description?: string | null
  /** Vast tijdstip voor DTSTAMP (testbaar); default nu. */
  stampIso?: string
  /**
   * Meldingen vóór de aftrap, in minuten (bv. [1440, 60] = daags ervoor en een uur ervoor).
   * Een lege lijst betekent: geen melding. Agenda's die VALARM ondersteunen (Google bij het
   * importeren van een bestand, Apple Agenda, Outlook) zetten die er dan zelf bij.
   */
  alarmsMin?: number[]
}

/** Standaardmeldingen: de dag ervoor (plannen) en een uur ervoor (vertrekken). */
export const DEFAULT_ALARMS_MIN = [24 * 60, 60]

/** VALARM-blokken voor de opgegeven meldingen. Waarden ≤ 0 of onzin worden genegeerd. */
function alarmLines(minuten: number[] | undefined, summary: string): string[] {
  const lijst = (minuten ?? DEFAULT_ALARMS_MIN)
    .map((m) => Math.round(Number(m)))
    .filter((m) => Number.isFinite(m) && m > 0)
  return [...new Set(lijst)].flatMap((m) => [
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsEscape(summary)}`,
    `TRIGGER:-PT${m}M`,
    'END:VALARM',
  ])
}

function eventLines(o: MatchIcsInput): (string | null)[] {
  const start = new Date(o.startIso)
  const end = new Date(start.getTime() + (o.durationMin ?? 120) * 60_000)
  const stamp = o.stampIso ? new Date(o.stampIso) : new Date()
  const summary = o.reeks ? `${o.home} – ${o.away} (${o.reeks})` : `${o.home} – ${o.away}`
  return [
    'BEGIN:VEVENT',
    `UID:krachtbal-match-${o.id}@krachtbal-live`,
    `DTSTAMP:${toIcsUtc(stamp)}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${icsEscape(summary)}`,
    o.location ? `LOCATION:${icsEscape(o.location)}` : null,
    o.url ? `URL:${icsEscape(o.url)}` : null,
    o.description ? `DESCRIPTION:${icsEscape(o.description)}` : null,
    ...alarmLines(o.alarmsMin, summary),
    'END:VEVENT',
  ]
}

function calendar(name: string | null, events: (string | null)[]): string {
  const lines: (string | null)[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Krachtbal Live//NL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    name ? `X-WR-CALNAME:${icsEscape(name)}` : null,
    ...events,
    'END:VCALENDAR',
  ]
  return lines.filter((l): l is string => l !== null).map(fold).join('\r\n') + '\r\n'
}

/** Bouw een volledige VCALENDAR-string met één wedstrijd-event. */
export function buildMatchIcs(o: MatchIcsInput): string {
  return calendar(null, eventLines(o))
}

/** Bouw één VCALENDAR met meerdere wedstrijd-events — een hele seizoensagenda in één bestand
 * (ploeg, club, of een combinatie van beide/meerdere). Dubbele UID's (dezelfde match via twee
 * bronnen, bv. een club met meerdere ploegen tegen elkaar) worden er automatisch uit gefilterd. */
export function buildMultiMatchIcs(name: string | null, matches: MatchIcsInput[]): string {
  const seen = new Set<string | number>()
  const events = matches.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true))).flatMap(eventLines)
  return calendar(name, events)
}

/** Veilige bestandsnaam voor de download. */
export function icsFilename(home: string, away: string): string {
  const slug = (s: string) => s.normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()
  return `krachtbal-${slug(home)}-vs-${slug(away)}.ics`
}

/** Veilige bestandsnaam voor een gecombineerde/team-/clubagenda. */
export function icsFilenameFor(label: string): string {
  const slug = label.normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()
  return `krachtbal-agenda-${slug || 'seizoen'}.ics`
}
