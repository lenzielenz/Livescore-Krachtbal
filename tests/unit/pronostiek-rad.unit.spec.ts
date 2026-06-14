import { describe, it, expect } from 'vitest'

import { BONUS_COUNT, BONUS_MULTIPLIER, pickBonusMatches, prevWeekendDateIso } from '@/lib/pronostiek-rad'

describe('pickBonusMatches', () => {
  // Een vaste pseudo-random bron maakt de keuze deterministisch en dus testbaar.
  const seeded = (seq: number[]) => {
    let i = 0
    return () => seq[i++ % seq.length]
  }

  it('kiest het gevraagde aantal verschillende items', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8]
    const got = pickBonusMatches(items, 3, seeded([0.1, 0.5, 0.9, 0.3]))
    expect(got).toHaveLength(3)
    expect(new Set(got).size).toBe(3)
    got.forEach((g) => expect(items).toContain(g))
  })

  it('kiest nooit meer dan er beschikbaar zijn', () => {
    const got = pickBonusMatches([1, 2], BONUS_COUNT)
    expect(got).toHaveLength(2)
    expect(new Set(got).size).toBe(2)
  })

  it('laat de oorspronkelijke lijst ongemoeid', () => {
    const items = [1, 2, 3, 4]
    const copy = items.slice()
    pickBonusMatches(items, 2, seeded([0.9, 0.1]))
    expect(items).toEqual(copy)
  })

  it('geeft een lege lijst bij geen kandidaten', () => {
    expect(pickBonusMatches([], 3)).toEqual([])
  })
})

describe('constanten', () => {
  it('boost is ×2 en kiest 3 wedstrijden', () => {
    expect(BONUS_MULTIPLIER).toBe(2)
    expect(BONUS_COUNT).toBe(3)
  })
})

describe('prevWeekendDateIso', () => {
  it('gaat exact zeven dagen terug', () => {
    const now = new Date('2026-06-14T12:00:00.000Z')
    const prev = new Date(prevWeekendDateIso(now))
    expect(now.getTime() - prev.getTime()).toBe(7 * 24 * 3600 * 1000)
  })
})
