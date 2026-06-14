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
}

/** Bouw een volledige VCALENDAR-string met één wedstrijd-event. */
export function buildMatchIcs(o: MatchIcsInput): string {
  const start = new Date(o.startIso)
  const end = new Date(start.getTime() + (o.durationMin ?? 120) * 60_000)
  const stamp = o.stampIso ? new Date(o.stampIso) : new Date()
  const summary = o.reeks ? `${o.home} – ${o.away} (${o.reeks})` : `${o.home} – ${o.away}`
  const lines: (string | null)[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Krachtbal Live//NL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:krachtbal-match-${o.id}@krachtbal-live`,
    `DTSTAMP:${toIcsUtc(stamp)}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${icsEscape(summary)}`,
    o.location ? `LOCATION:${icsEscape(o.location)}` : null,
    o.url ? `URL:${icsEscape(o.url)}` : null,
    o.description ? `DESCRIPTION:${icsEscape(o.description)}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.filter((l): l is string => l !== null).map(fold).join('\r\n') + '\r\n'
}

/** Veilige bestandsnaam voor de download. */
export function icsFilename(home: string, away: string): string {
  const slug = (s: string) => s.normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()
  return `krachtbal-${slug(home)}-vs-${slug(away)}.ics`
}
