import { describe, it, expect } from 'vitest'

import { basePoints, buildPredictionLeaderboard, scoreMatchPredictions, type PredEntry } from '@/lib/prediction-score'

const pred = (userId: number, home: number, away: number, clubId = 1, name = `U${userId}`): PredEntry => ({ userId, name, clubId, home, away })

describe('basePoints', () => {
  it('geeft 10 voor de exacte uitslag', () => {
    expect(basePoints({ home: 11, away: 15 }, { home: 11, away: 15 })).toMatchObject({ base: 10, exact: true, resultOk: true, diffOk: true })
  })
  it('geeft 6 voor juiste winnaar + juist doelsaldo', () => {
    expect(basePoints({ home: 11, away: 15 }, { home: 10, away: 14 })).toMatchObject({ base: 6, exact: false, resultOk: true, diffOk: true })
  })
  it('geeft 4 voor enkel de juiste winnaar', () => {
    expect(basePoints({ home: 11, away: 15 }, { home: 12, away: 23 })).toMatchObject({ base: 4, resultOk: true, diffOk: false })
  })
  it('geeft 0 bij een verkeerde uitslag', () => {
    expect(basePoints({ home: 11, away: 15 }, { home: 22, away: 21 }).base).toBe(0)
  })
})

describe('scoreMatchPredictions', () => {
  // Het voorbeeld van de gebruiker: eindstand 11–15.
  const actual = { home: 11, away: 15 }
  const preds = [pred(1, 11, 16), pred(2, 22, 21), pred(3, 12, 23)]
  const scored = scoreMatchPredictions(actual, preds)
  const byUser = (id: number) => scored.find((s) => s.userId === id)!

  it('beloont de dichtste voorspelling het meest', () => {
    // #1 (11–16): juiste winnaar (4) + nabij (afw. 1 → 3) + dichtste (3) = 10.
    expect(byUser(1).points).toBe(10)
    expect(byUser(1).closest).toBe(true)
  })
  it('geeft 0 aan een volledig verkeerde voorspelling', () => {
    expect(byUser(2).points).toBe(0)
    expect(byUser(2).closest).toBe(false)
  })
  it('geeft de juiste winnaar maar verre afwijking enkel de basis', () => {
    // #3 (12–23): winnaar ok (4), afw. 1+8=9 → nabij 0, niet dichtste = 4.
    expect(byUser(3).points).toBe(4)
  })

  it('schaalt de punten met de weging (later voorspeld = minder waard)', () => {
    const half = scoreMatchPredictions({ home: 11, away: 15 }, [{ ...pred(1, 11, 15), weight: 0.5 }])
    // Exact (10) + nabij (4) + dichtste (3) = 17, × 0,5 = 8,5 → 9 (afgerond).
    expect(half[0].points).toBe(9)
    const full = scoreMatchPredictions({ home: 11, away: 15 }, [pred(1, 11, 15)])
    expect(full[0].points).toBe(17)
  })

  it('verdubbelt de punten voor een bonuswedstrijd (×2 via het rad)', () => {
    const normal = scoreMatchPredictions({ home: 11, away: 15 }, [pred(1, 11, 15)])
    const boosted = scoreMatchPredictions({ home: 11, away: 15 }, [pred(1, 11, 15)], 2)
    expect(boosted[0].points).toBe(normal[0].points * 2)
  })
})

describe('buildPredictionLeaderboard', () => {
  it('telt punten per persoon op en sorteert', () => {
    const matches = [
      { actual: { home: 11, away: 15 }, preds: [pred(1, 11, 15), pred(2, 10, 16)] }, // #1 exact
      { actual: { home: 20, away: 18 }, preds: [pred(1, 19, 18), pred(2, 20, 18)] }, // #2 exact
    ]
    const lb = buildPredictionLeaderboard(matches)
    expect(lb).toHaveLength(2)
    expect(lb[0].points).toBeGreaterThanOrEqual(lb[1].points)
    expect(lb.find((r) => r.userId === 1)!.exact).toBe(1)
    expect(lb.find((r) => r.userId === 2)!.exact).toBe(1)
  })

  it('scoort enkel de meegegeven (gefilterde) groep — bv. een pool of club', () => {
    // De aanroeper filtert vooraf op de groep; hier enkel speler 1.
    const matches = [{ actual: { home: 11, away: 15 }, preds: [pred(1, 11, 15, 1)] }]
    const lb = buildPredictionLeaderboard(matches)
    expect(lb).toHaveLength(1)
    expect(lb[0].userId).toBe(1)
  })

  it('past de wedstrijd-bonus toe in het klassement', () => {
    const plain = buildPredictionLeaderboard([{ actual: { home: 11, away: 15 }, preds: [pred(1, 11, 15)] }])
    const bonus = buildPredictionLeaderboard([{ actual: { home: 11, away: 15 }, preds: [pred(1, 11, 15)], bonus: 2 }])
    expect(bonus[0].points).toBe(plain[0].points * 2)
  })
})
