import type { XpPlayer } from './expected-points'

// Team-efficiëntie (xP): werkelijk gescoorde punten vs. verwachte punten (xG-model) van een ploeg.
// Boven verwachting = klinisch/efficiënt afgewerkt; onder verwachting = ruimte voor groei.
// Pure functie over de reeds berekende xP-spelers → los testbaar.

export interface TeamEfficiency {
  actual: number
  expected: number
  /** actual − expected (afgerond). + = boven verwachting. */
  diff: number
  attempts: number
  goals: number
}

export function teamEfficiency(players: XpPlayer[], teamId: number): TeamEfficiency {
  const ps = players.filter((p) => p.teamId === teamId)
  const actual = ps.reduce((a, p) => a + p.points, 0)
  const expected = Math.round(ps.reduce((a, p) => a + p.xPoints, 0) * 10) / 10
  return {
    actual,
    expected,
    diff: Math.round((actual - expected) * 10) / 10,
    attempts: ps.reduce((a, p) => a + p.attempts, 0),
    goals: ps.reduce((a, p) => a + p.goals, 0),
  }
}

/** Korte duiding van het verschil tussen werkelijke en verwachte punten. */
export function efficiencyLabel(diff: number): { txt: string; tone: 'over' | 'under' | 'even' } {
  if (diff >= 2) return { txt: 'boven verwachting', tone: 'over' }
  if (diff <= -2) return { txt: 'onder verwachting', tone: 'under' }
  return { txt: 'zoals verwacht', tone: 'even' }
}
