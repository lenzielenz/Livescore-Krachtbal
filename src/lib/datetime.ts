// Belgische tijd, overal. De server draait (op Railway) in UTC; zonder expliciete tijdzone toont
// een datum dus de UTC-tijd i.p.v. de lokale Belgische tijd — wat het uur (en bij avondwedstrijden
// zelfs de dag) verkeerd zet. Deze helpers forceren altijd Europe/Brussels.
export const TZ = 'Europe/Brussels'
export const LOCALE = 'nl-BE'

/** Uur (HH:mm) in Belgische tijd. */
export function formatTimeBE(d: Date | string | number): string {
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', timeZone: TZ })
}

/** Datum + uur in Belgische tijd, met instelbare stijl (default kort). */
export function formatDateTimeBE(
  d: Date | string | number,
  opts: Intl.DateTimeFormatOptions = { dateStyle: 'long', timeStyle: 'short' },
): string {
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(LOCALE, { ...opts, timeZone: TZ })
}

/** Datum "YYYY-MM-DD" in Belgische tijd (default: nu) — voor "vandaag" en dag-navigatie. */
export function dateStrBE(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

/** Offset (ms) van Europe/Brussels t.o.v. UTC op een bepaald moment (DST-bewust). */
function brusselsOffsetMs(at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const p = dtf.formatToParts(at).reduce<Record<string, string>>((a, x) => {
    a[x.type] = x.value
    return a
  }, {})
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return asUtc - at.getTime()
}

/** Belgische kalenderdelen van een instant (DST-bewust). weekdayMon0: 0 = maandag … 6 = zondag. */
export function brusselsParts(at: Date): { year: number; month: number; day: number; hour: number; minute: number; weekdayMon0: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hourCycle: 'h23',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  const p = dtf.formatToParts(at).reduce<Record<string, string>>((a, x) => {
    a[x.type] = x.value
    return a
  }, {})
  const wk: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, weekdayMon0: wk[p.weekday] ?? 0 }
}

/** Het UTC-instant van een Belgische wandklok-tijd (jaar/maand/dag/uur, DST-bewust). */
export function brusselsWallUtc(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0))
  return new Date(guess.getTime() - brusselsOffsetMs(guess))
}

/** Het UTC-instant van middernacht (Belgische tijd) voor een datum "YYYY-MM-DD". */
export function brusselsMidnightUtc(dateStr: string): Date {
  const utcMidnight = new Date(`${dateStr}T00:00:00Z`)
  return new Date(utcMidnight.getTime() - brusselsOffsetMs(utcMidnight))
}

/** [start, end) van één Belgische kalenderdag, als ISO-instants — voor dag-queries. */
export function brusselsDayBoundsUtc(dateStr: string): { start: string; end: string } {
  const start = brusselsMidnightUtc(dateStr)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start: start.toISOString(), end: end.toISOString() }
}
