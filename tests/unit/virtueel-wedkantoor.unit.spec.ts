import { describe, expect, it } from 'vitest'

import type { PredEntry } from '@/lib/prediction-score'
import { legeWedkantoorStats, radKansen, vatPronostiekSamen } from '@/lib/virtueel-wedkantoor'

const p = (userId: number, name: string, home: number, away: number): PredEntry => ({ userId, name, clubId: null, home, away })

describe('wedkantoor', () => {
  it('telt de kansen per vermenigvuldiger samen tot ~100%', () => {
    const k = radKansen()
    expect(k.map((x) => x.mult)).toEqual([1.5, 2, 3, 5, 10])
    expect(k.reduce((a, x) => a + x.pct, 0)).toBeGreaterThanOrEqual(99)
    expect(k.find((x) => x.mult === 10)!.pct).toBeLessThan(k.find((x) => x.mult === 1.5)!.pct)
  })

  it('vat de pronostiek samen: deelnemers, exact, uitblinkers, populairste uitslag en jouw plaats', () => {
    const s = vatPronostiekSamen(
      '2026-2027',
      [
        { actual: { home: 12, away: 10 }, preds: [p(1, 'Lotte', 12, 10), p(2, 'Jan', 8, 9), p(3, 'Mo', 12, 10)] },
        { actual: { home: 7, away: 11 }, preds: [p(1, 'Lotte', 6, 11), p(2, 'Jan', 12, 10)] },
      ],
      { winnaars: ['Lotte'] },
      2,
    )
    expect(s.deelnemers).toBe(3)
    expect(s.wedstrijden).toBe(2)
    expect(s.voorspellingen).toBe(5)
    expect(s.exact).toBe(2)
    expect(s.exactPct).toBe(40)
    expect(s.top[0].naam).toBe('Lotte')
    expect(s.scherpste?.naam).toBe('Lotte')
    expect(s.populairst).toEqual({ uitslag: '12 – 10', aantal: 3 })
    expect(s.radWinnaars).toEqual(['Lotte'])
    expect(s.ik?.rank).toBe(3)
  })

  it('werkt ook zonder voorspellingen', () => {
    const s = legeWedkantoorStats('2026-2027')
    expect(s.deelnemers).toBe(0)
    expect(s.top).toEqual([])
    expect(s.populairst).toBeNull()
    expect(s.ik).toBeNull()
  })
})
