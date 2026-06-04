// Klassementspunten voor de competitierangschikking.
// Conventie (KVKBF, door de federatie bevestigd): winst 4, gelijk 3, verlies 2,
// forfait 0. Het spelreglement bepaalt enkel de matchscore (rugworp = 2 punten),
// niet de klassementspunten — die staan hier.
export const STANDINGS_POINTS = { win: 4, draw: 3, loss: 2, forfait: 0 } as const

export type Forfait = 'none' | 'home' | 'away' | 'both'

export type StandingsMatch = {
  homeId: number
  awayId: number
  homeGoals: number
  awayGoals: number
  forfait: Forfait
  /** Optioneel: speeldatum (ISO), voor week-over-week vergelijking. computeStandings negeert dit. */
  date?: string
}

export type StandingRow = {
  teamId: number
  played: number
  won: number
  drawn: number
  lost: number
  forfaits: number
  goalsFor: number
  goalsAgainst: number
  diff: number
  points: number
}

/** Vertaal de forfait-aanduiding van het wedstrijdblad (geen/thuis/uit/dubbel). */
export function forfaitFromUitslag(u: unknown): Forfait {
  switch (u) {
    case 'thuis':
      return 'home'
    case 'uit':
      return 'away'
    case 'dubbel':
      return 'both'
    default:
      return 'none'
  }
}

/**
 * Bouwt de rangschikking uit de afgelopen wedstrijden. `teamIds` (optioneel) zorgt
 * dat ook ploegen die nog niet speelden in de tabel staan (0 op alles).
 * Sortering: punten → doelsaldo → doelpunten voor → teamId (stabiel).
 */
export function computeStandings(matches: StandingsMatch[], teamIds: number[] = []): StandingRow[] {
  const table = new Map<number, StandingRow>()
  const row = (id: number): StandingRow => {
    let r = table.get(id)
    if (!r) {
      r = { teamId: id, played: 0, won: 0, drawn: 0, lost: 0, forfaits: 0, goalsFor: 0, goalsAgainst: 0, diff: 0, points: 0 }
      table.set(id, r)
    }
    return r
  }
  for (const id of teamIds) row(id)

  const P = STANDINGS_POINTS
  for (const m of matches) {
    const h = row(m.homeId)
    const a = row(m.awayId)
    h.played++
    a.played++
    h.goalsFor += m.homeGoals
    h.goalsAgainst += m.awayGoals
    a.goalsFor += m.awayGoals
    a.goalsAgainst += m.homeGoals

    if (m.forfait === 'both') {
      // Beide forfait: geen punten voor niemand.
      h.forfaits++
      a.forfaits++
    } else if (m.forfait === 'home') {
      h.forfaits++
      a.won++
      a.points += P.win
    } else if (m.forfait === 'away') {
      a.forfaits++
      h.won++
      h.points += P.win
    } else if (m.homeGoals > m.awayGoals) {
      h.won++
      h.points += P.win
      a.lost++
      a.points += P.loss
    } else if (m.homeGoals < m.awayGoals) {
      a.won++
      a.points += P.win
      h.lost++
      h.points += P.loss
    } else {
      h.drawn++
      a.drawn++
      h.points += P.draw
      a.points += P.draw
    }
  }

  for (const r of table.values()) r.diff = r.goalsFor - r.goalsAgainst
  return [...table.values()].sort(
    (x, y) => y.points - x.points || y.diff - x.diff || y.goalsFor - x.goalsFor || x.teamId - y.teamId,
  )
}
