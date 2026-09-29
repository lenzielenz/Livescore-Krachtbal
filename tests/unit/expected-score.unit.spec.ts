import { describe, expect, it } from 'vitest'

import { computeExpectedScore, type TeamForm } from '@/lib/expected-score'

const form = (over: Partial<TeamForm>): TeamForm => ({ attack: 15, defense: 15, pointsPerMatch: 3, ...over })

describe('computeExpectedScore', () => {
  it('blendt aanval van elke ploeg met de verdediging van de tegenstander', () => {
    const home = form({ attack: 20, defense: 10 })
    const away = form({ attack: 14, defense: 16 })
    // expHome = (thuisaanval + uitverdediging) / 2 = (20+16)/2 = 18
    // expAway = (uitaanval + thuisverdediging) / 2 = (14+10)/2 = 12
    expect(computeExpectedScore(home, away)).toEqual({ home: 18, away: 12 })
  })

  it('twee gelijk sterke ploegen krijgen een gelijke verwachte score', () => {
    const home = form({ attack: 15, defense: 15, pointsPerMatch: 3 })
    const away = form({ attack: 15, defense: 15, pointsPerMatch: 3 })
    expect(computeExpectedScore(home, away)).toEqual({ home: 15, away: 15 })
  })

  it('de leider krijgt een kleine verschuiving in haar voordeel bij gelijke aanval/verdediging', () => {
    const home = form({ pointsPerMatch: 4 }) // wint elke wedstrijd
    const away = form({ pointsPerMatch: 2 }) // verliest elke wedstrijd
    const exp = computeExpectedScore(home, away)
    expect(exp.home).toBeGreaterThan(exp.away)
  })

  it('de rangschikking-verschuiving is begrensd, ook bij een extreem verschil', () => {
    const home = form({ pointsPerMatch: 4 })
    const away = form({ pointsPerMatch: 0 })
    const exp = computeExpectedScore(home, away)
    // Zonder begrenzing zou het verschil hier veel groter zijn dan de max-nudge (6) toelaat.
    expect(exp.home - exp.away).toBeLessThanOrEqual(6)
  })

  it('gaat nooit onder 0', () => {
    const home = form({ attack: 0, defense: 30, pointsPerMatch: 0 })
    const away = form({ attack: 0, defense: 30, pointsPerMatch: 4 })
    const exp = computeExpectedScore(home, away)
    expect(exp.home).toBeGreaterThanOrEqual(0)
    expect(exp.away).toBeGreaterThanOrEqual(0)
  })
})
