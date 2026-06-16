import { describe, it, expect } from 'vitest'

import { buildWrapped, WRAPPED_THRESHOLDS, type WrappedInput } from '@/lib/wrapped'

const base: WrappedInput = {
  season: '2025-2026',
  matchesAttended: 0,
  goalsSeen: 0,
  predictionPoints: 0,
  exactPredictions: 0,
  badgesEarned: 0,
  mvpVotesCast: 0,
  fanRank: null,
  fanTotal: 0,
}

describe('buildWrapped', () => {
  it('leeg profiel → Nieuwkomer, geen highlights', () => {
    const w = buildWrapped(base)
    expect(w.persona.title).toBe('Nieuwkomer')
    expect(w.highlights).toHaveLength(0)
    expect(w.topPercent).toBeNull()
  })

  it('veel aanwezigheid → Tribuneheld', () => {
    const w = buildWrapped({ ...base, matchesAttended: WRAPPED_THRESHOLDS.tribuneHeld })
    expect(w.persona.title).toBe('Tribuneheld')
  })

  it('veel pronostiekpunten (weinig aanwezig) → Het Orakel', () => {
    const w = buildWrapped({ ...base, matchesAttended: 1, predictionPoints: WRAPPED_THRESHOLDS.orakel })
    expect(w.persona.title).toBe('Het Orakel')
  })

  it('berekent het percentiel en toont een top-highlight', () => {
    const w = buildWrapped({ ...base, matchesAttended: 2, fanRank: 1, fanTotal: 10 }) // 2e van 10 → 20%
    expect(w.topPercent).toBe(20)
    expect(w.highlights).toContain('Top 20% van alle supporters.')
  })

  it('toont exacte voorspellingen boven losse punten', () => {
    const w = buildWrapped({ ...base, exactPredictions: 2, predictionPoints: 18 })
    expect(w.highlights).toContain('2× de exacte uitslag voorspeld.')
    expect(w.highlights.some((h) => h.includes('pronostiekpunten'))).toBe(false)
  })
})
