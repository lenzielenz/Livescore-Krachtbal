import type { SeasonPlayer } from './season-stats'

// Spelers in beweging: wie zit in stijgende of dalende vorm binnen het seizoen. We vergelijken
// het gemiddelde aantal punten in de eerste helft van de gespeelde wedstrijden met de tweede
// helft (uit de vormtrend). Pure functie → los testbaar.

export interface Mover {
  playerId: number
  name: string
  shirtNumber: number
  early: number
  late: number
  /** late − early (punten per wedstrijd), afgerond. */
  delta: number
  matches: number
}

export interface PlayerMovers {
  risers: Mover[]
  fallers: Mover[]
}

const MIN_MATCHES = 4
const MIN_DELTA = 0.5

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

export function buildPlayerMovers(players: SeasonPlayer[], limit = 3): PlayerMovers {
  const movers: Mover[] = []
  for (const p of players) {
    const pts = p.trend.map((t) => t.points)
    if (pts.length < MIN_MATCHES) continue
    const half = Math.floor(pts.length / 2)
    const early = avg(pts.slice(0, half))
    const late = avg(pts.slice(half))
    const delta = Math.round((late - early) * 10) / 10
    if (Math.abs(delta) < MIN_DELTA) continue
    movers.push({ playerId: p.playerId, name: p.name, shirtNumber: p.shirtNumber, early: Math.round(early * 10) / 10, late: Math.round(late * 10) / 10, delta, matches: pts.length })
  }
  const risers = movers.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, limit)
  const fallers = movers.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, limit)
  return { risers, fallers }
}
