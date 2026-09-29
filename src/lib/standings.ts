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

// Forfait-uitslag (KVKBF): de niet-forfaiterende ploeg wint met 30–0; bij dubbel forfait 0–0.
export const FORFAIT_GOALS = 30

/** De vaste eindstand die bij een forfait hoort, of null als er geen forfait is. */
export function forfaitScore(uitslag: unknown): { home: number; away: number } | null {
  switch (uitslag) {
    case 'thuis':
      return { home: 0, away: FORFAIT_GOALS }
    case 'uit':
      return { home: FORFAIT_GOALS, away: 0 }
    case 'dubbel':
      return { home: 0, away: 0 }
    default:
      return null
  }
}

/** Klopt deze eindstand met het vaste forfait-patroon (30–0 of 0–30)? Herkenbaar aan de score
 *  alleen — ook voor wedstrijden zonder wedstrijdblad (bv. via de federatie-import), die geen
 *  apart forfait-veld hebben. De ploeg die niet forfaiteerde, heeft er niets voor moeten doen —
 *  dus telt zo'n uitslag niet mee als "prestatie" (zwaarste zege, ploeg van de week, …). */
export function isForfaitScore(homeGoals: number, awayGoals: number): boolean {
  return (homeGoals === FORFAIT_GOALS && awayGoals === 0) || (awayGoals === FORFAIT_GOALS && homeGoals === 0)
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
