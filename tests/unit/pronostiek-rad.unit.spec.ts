import { describe, it, expect } from 'vitest'

import { pickMultiplier, prevWeekendDateIso, RAD_SEGMENTS, RAD_TOP_N, TOKENS_PER_WIN } from '@/lib/pronostiek-rad'

describe('pickMultiplier', () => {
  // Een vaste pseudo-random bron maakt de trekking deterministisch en dus testbaar.
  it('geeft altijd een waarde die ook écht op het rad staat (animatie kan landen)', () => {
    const values = new Set(RAD_SEGMENTS as readonly number[])
    for (let r = 0; r < 1; r += 0.05) {
      expect(values.has(pickMultiplier(() => r))).toBe(true)
    }
  })
  it('dekt het hele gewogen bereik (eerste en laatste segmentwaarde)', () => {
    const uniq = [...new Set(RAD_SEGMENTS as readonly number[])]
    expect(pickMultiplier(() => 0)).toBe(uniq[0])
    expect(pickMultiplier(() => 0.999999)).toBe(uniq[uniq.length - 1])
  })
})

describe('constanten', () => {
  it('top 3 mogen draaien en winnen 3 boosters', () => {
    expect(RAD_TOP_N).toBe(3)
    expect(TOKENS_PER_WIN).toBe(3)
  })
  it('het rad bevat meerdere vermenigvuldigers > 1', () => {
    expect(RAD_SEGMENTS.length).toBeGreaterThanOrEqual(6)
    expect(RAD_SEGMENTS.every((v) => v > 1)).toBe(true)
  })
})

describe('prevWeekendDateIso', () => {
  it('gaat exact zeven dagen terug', () => {
    const now = new Date('2026-06-14T12:00:00.000Z')
    const prev = new Date(prevWeekendDateIso(now))
    expect(now.getTime() - prev.getTime()).toBe(7 * 24 * 3600 * 1000)
  })
})
