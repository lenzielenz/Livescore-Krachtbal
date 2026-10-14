import { DEFAULT_AWAY_COLOR, DEFAULT_HOME_COLOR, type ClubColors } from './club-colors'
import type { WeekendBord, WeekendZaal } from './virtueel'

// De weekendzaal in de gangen van het virtuele stadion: de wedstrijden van het komende speelweekend
// (op zaterdag en zondag: het lopende). Wat al gespeeld is, staat er met de eindstand; wat bezig
// is, met de live-stand. Zo ziet de gang er elke keer anders uit. Puur: geen DB, geen DOM — de
// pagina laadt de wedstrijden (loadLiveWeekend), de live-standen komen van het gedeelde
// weekendkanaal (day-channel.ts) en worden hier toegepast.

/** Wat de zaal van een wedstrijd nodig heeft (een deelverzameling van DayMatch op /live). */
export type WeekendWedstrijd = {
  id: number
  reeks: string
  time: string
  kickoff: string
  status: string
  awaitingResult?: boolean
  score: { home: number; away: number }
  home: { name: string; clubId: number | null; colors?: ClubColors | null }
  away: { name: string; clubId: number | null; colors?: ClubColors | null }
}

/** De veranderlijke stand die het live-weekendkanaal doorstuurt (LiveScore). */
export type WeekendStand = { id: number; status: string; awaitingResult: boolean; score: { home: number; away: number } }

const DAGEN = ['ZO', 'MA', 'DI', 'WO', 'DO', 'VR', 'ZA']
const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']

function statusVan(status: string, wacht: boolean | undefined): WeekendBord['status'] {
  if (status === 'finished') return 'gespeeld'
  if (status === 'live') return 'live'
  return wacht ? 'wacht' : 'gepland'
}

/** De dag van de wedstrijd op de Belgische kalender ("ZA"/"ZO"). */
function dagVan(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Brussels', weekday: 'short' }).format(d)
  return DAGEN[['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd)] ?? ''
}

/** "za 17 – zo 18 oktober" (of over een maandgrens: "za 31 oktober – zo 1 november"). */
export function weekendDatum(zaterdag: string): string {
  const [j, m, d] = zaterdag.split('-').map(Number)
  const za = new Date(Date.UTC(j, m - 1, d))
  const zo = new Date(za.getTime() + 86_400_000)
  const mZa = MAANDEN[za.getUTCMonth()]
  const mZo = MAANDEN[zo.getUTCMonth()]
  return mZa === mZo ? `za ${za.getUTCDate()} – zo ${zo.getUTCDate()} ${mZo}` : `za ${za.getUTCDate()} ${mZa} – zo ${zo.getUTCDate()} ${mZo}`
}

/** "14 wedstrijden · 3 gespeeld · 1 live" — of dat er niet gespeeld wordt. */
export function weekendTelling(z: Pick<WeekendZaal, 'totaal' | 'gespeeld' | 'live'>): string {
  if (z.totaal === 0) return 'Dit weekend wordt er niet gespeeld'
  return [`${z.totaal} ${z.totaal === 1 ? 'wedstrijd' : 'wedstrijden'}`, z.gespeeld ? `${z.gespeeld} gespeeld` : '', z.live ? `${z.live} live` : '']
    .filter(Boolean)
    .join(' · ')
}

/**
 * Bouwt de weekendzaal: de wedstrijden van je eigen club eerst, daarna de rest, telkens in volgorde
 * van aftrap. Maximaal `max` borden (zoveel als er aan de muur passen); de telling gaat wel over
 * het hele weekend.
 */
export function weekendZaal(
  wedstrijden: WeekendWedstrijd[],
  o: { clubId: number | null; zaterdag: string; bezig: boolean; max?: number },
): WeekendZaal {
  const max = o.max ?? 28
  const borden = wedstrijden.map((m): WeekendBord => {
    const status = statusVan(m.status, m.awaitingResult)
    return {
      id: m.id,
      dag: dagVan(m.kickoff),
      uur: m.time,
      reeks: m.reeks,
      thuis: m.home.name,
      uit: m.away.name,
      thuisKleur: m.home.colors?.primary ?? DEFAULT_HOME_COLOR,
      uitKleur: m.away.colors?.primary ?? DEFAULT_AWAY_COLOR,
      status,
      score: status === 'live' || status === 'gespeeld' ? { ...m.score } : null,
      eigen: o.clubId != null && (m.home.clubId === o.clubId || m.away.clubId === o.clubId),
    }
  })
  const aftrap = new Map(wedstrijden.map((m) => [m.id, m.kickoff]))
  borden.sort((a, b) => Number(b.eigen) - Number(a.eigen) || String(aftrap.get(a.id)).localeCompare(String(aftrap.get(b.id))) || a.id - b.id)
  return {
    zaterdag: o.zaterdag,
    datum: weekendDatum(o.zaterdag),
    totaal: borden.length,
    gespeeld: borden.filter((b) => b.status === 'gespeeld').length,
    live: borden.filter((b) => b.status === 'live').length,
    bezig: o.bezig,
    borden: borden.slice(0, max),
  }
}

/**
 * Past de live-standen van het weekendkanaal toe. Dat kanaal stuurt de stand van élke wedstrijd van
 * het weekend, dus ook de tellingen volgen eruit. Geeft dezelfde zaal terug als er niets veranderde
 * (dan hoeft de muur niet opnieuw getekend te worden), anders een nieuwe.
 */
export function pasStandenToe(zaal: WeekendZaal, standen: WeekendStand[]): WeekendZaal {
  const perId = new Map(standen.map((s) => [s.id, s]))
  let veranderd = false
  const borden = zaal.borden.map((b) => {
    const s = perId.get(b.id)
    if (!s) return b
    const status = statusVan(s.status, s.awaitingResult)
    const score = status === 'live' || status === 'gespeeld' ? s.score : null
    if (status === b.status && score?.home === b.score?.home && score?.away === b.score?.away) return b
    veranderd = true
    return { ...b, status, score: score ? { ...score } : null }
  })
  const statussen = standen.map((s) => statusVan(s.status, s.awaitingResult))
  const tellers = standen.length
    ? { totaal: Math.max(zaal.totaal, standen.length), gespeeld: statussen.filter((x) => x === 'gespeeld').length, live: statussen.filter((x) => x === 'live').length }
    : { totaal: zaal.totaal, gespeeld: zaal.gespeeld, live: zaal.live }
  if (!veranderd && tellers.gespeeld === zaal.gespeeld && tellers.live === zaal.live && tellers.totaal === zaal.totaal) return zaal
  return { ...zaal, ...tellers, borden }
}
