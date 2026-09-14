export type WeekendMatch = {
  id: number
  date: string
  time: string
  day: string
  side: 'home' | 'away'
  team: string
  opponent: string
  series: string
}

const BRUSSELS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Brussels',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function localParts(date: Date): { year: number; month: number; day: number } {
  const p = Object.fromEntries(BRUSSELS.formatToParts(date).map((v) => [v.type, v.value]))
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day) }
}

/** Het relevante weekend: op zondag het lopende weekend, anders het eerstvolgende. */
export function weekendWindow(now = new Date()) {
  const p = localParts(now)
  const localNoon = new Date(Date.UTC(p.year, p.month - 1, p.day, 12))
  const weekday = localNoon.getUTCDay()
  const daysToSaturday = weekday === 0 ? -1 : (6 - weekday + 7) % 7
  const saturday = new Date(localNoon)
  saturday.setUTCDate(saturday.getUTCDate() + daysToSaturday)
  const monday = new Date(saturday)
  monday.setUTCDate(monday.getUTCDate() + 2)
  // Ruime UTC-grenzen; de uiteindelijke selectie gebeurt op Brusselse kalenderdatum.
  const queryStart = new Date(saturday)
  queryStart.setUTCHours(0, 0, 0, 0)
  queryStart.setUTCHours(queryStart.getUTCHours() - 3)
  const queryEnd = new Date(monday)
  queryEnd.setUTCHours(0, 0, 0, 0)
  queryEnd.setUTCHours(queryEnd.getUTCHours() + 3)
  return {
    saturdayKey: BRUSSELS.format(saturday),
    sundayKey: BRUSSELS.format(new Date(saturday.getTime() + 86_400_000)),
    queryStart,
    queryEnd,
  }
}

export function isInWeekend(date: Date, window: ReturnType<typeof weekendWindow>) {
  const key = BRUSSELS.format(date)
  return key === window.saturdayKey || key === window.sundayKey
}


/** Zoek vanaf vandaag ruim genoeg vooruit om de eerstvolgende echte speeldag te vinden. */
export function planningSearchWindow(now = new Date()) {
  const p = localParts(now)
  const start = new Date(Date.UTC(p.year, p.month - 1, p.day, 0))
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 22)
  return {
    queryStart: new Date(start.getTime() - 3 * 60 * 60 * 1000),
    queryEnd: new Date(end.getTime() + 3 * 60 * 60 * 1000),
  }
}

export function brusselsDateKey(value: Date | string): string {
  return BRUSSELS.format(typeof value === 'string' ? new Date(value) : value)
}

/**
 * Kies de eerstvolgende dag waarop de club werkelijk speelt. Valt die op zaterdag, dan hoort de
 * aansluitende zondag bij hetzelfde weekendplan. Zo springt het plan op maandag automatisch naar
 * de volgende speeldag, ook wanneer die uitzonderlijk niet in een klassiek weekend valt.
 */
export function nextPlayDayKeys(dates: Array<Date | string>, now = new Date()): string[] {
  const today = brusselsDateKey(now)
  const keys = [...new Set(dates.map(brusselsDateKey).filter((key) => key >= today))].sort()
  const first = keys[0]
  if (!first) return []
  const firstDate = new Date(`${first}T12:00:00Z`)
  if (firstDate.getUTCDay() !== 6) return [first]
  const sunday = new Date(firstDate)
  sunday.setUTCDate(sunday.getUTCDate() + 1)
  const sundayKey = brusselsDateKey(sunday)
  return keys.includes(sundayKey) ? [first, sundayKey] : [first]
}
