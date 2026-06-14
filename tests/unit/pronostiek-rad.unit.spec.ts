import { describe, it, expect } from 'vitest'

import {
  activeTokens,
  pickSegmentIndex,
  prevWeekendDateIso,
  RAD_SEGMENTS,
  radWinnerCount,
  segmentArcs,
  SPINS_PER_WEEK,
  tokenExpiry,
  TOKEN_WEEKS_VALID,
} from '@/lib/pronostiek-rad'

describe('segmentArcs', () => {
  it('dekt de volledige cirkel (0 → 360) zonder gaten', () => {
    const arcs = segmentArcs()
    expect(arcs[0].start).toBe(0)
    expect(arcs[arcs.length - 1].end).toBeCloseTo(360, 5)
    for (let i = 1; i < arcs.length; i++) expect(arcs[i].start).toBeCloseTo(arcs[i - 1].end, 5)
  })
  it('geeft grotere punten aan zwaardere segmenten', () => {
    const arcs = segmentArcs()
    const big = arcs.reduce((a, b) => (b.weight > a.weight ? b : a))
    const small = arcs.reduce((a, b) => (b.weight < a.weight ? b : a))
    expect(big.end - big.start).toBeGreaterThan(small.end - small.start)
  })
})

describe('pickSegmentIndex', () => {
  it('geeft altijd een geldige index', () => {
    for (let r = 0; r < 1; r += 0.05) {
      const i = pickSegmentIndex(RAD_SEGMENTS, () => r)
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThan(RAD_SEGMENTS.length)
    }
  })
  it('laagste random = eerste vak, hoogste = laatste', () => {
    expect(pickSegmentIndex(RAD_SEGMENTS, () => 0)).toBe(0)
    expect(pickSegmentIndex(RAD_SEGMENTS, () => 0.999999)).toBe(RAD_SEGMENTS.length - 1)
  })
})

describe('radWinnerCount — schaalt met het deelnemersveld', () => {
  it('beloont bij weinig deelnemers enkel de winnaar', () => {
    expect(radWinnerCount(1)).toBe(1)
    expect(radWinnerCount(4)).toBe(1)
    expect(radWinnerCount(10)).toBe(1)
  })
  it('groeit mee (~10%) bij grotere velden', () => {
    expect(radWinnerCount(30)).toBe(3)
    expect(radWinnerCount(100)).toBe(10)
  })
  it('nooit meer winnaars dan deelnemers, 0 bij geen deelnemers', () => {
    expect(radWinnerCount(0)).toBe(0)
    expect(radWinnerCount(2)).toBeLessThanOrEqual(2)
  })
})

describe('constanten & rad', () => {
  it('3 beurten, boosters 4 weken geldig', () => {
    expect(SPINS_PER_WEEK).toBe(3)
    expect(TOKEN_WEEKS_VALID).toBe(4)
  })
  it('elk vak is een vermenigvuldiger > 1', () => {
    expect(RAD_SEGMENTS.length).toBeGreaterThanOrEqual(6)
    expect(RAD_SEGMENTS.every((s) => s.mult > 1 && s.weight > 0)).toBe(true)
  })
})

describe('boosters: vervaldatum & geldigheid', () => {
  it('tokenExpiry ligt 4 weken na het winnen', () => {
    const won = '2026-06-14T10:00:00.000Z'
    const exp = new Date(tokenExpiry(won)).getTime() - new Date(won).getTime()
    expect(exp).toBe(TOKEN_WEEKS_VALID * 7 * 86_400_000)
  })
  it('activeTokens filtert vervallen boosters weg', () => {
    const now = new Date('2026-06-14T12:00:00Z')
    const tokens = [
      { mult: 5, wonAt: '2026-06-13T00:00:00Z', expiresAt: '2026-07-11T00:00:00Z' }, // geldig
      { mult: 2, wonAt: '2026-05-01T00:00:00Z', expiresAt: '2026-05-29T00:00:00Z' }, // vervallen
    ]
    const live = activeTokens(tokens, now)
    expect(live).toHaveLength(1)
    expect(live[0].mult).toBe(5)
  })
  it('geeft een lege lijst bij geen boosters', () => {
    expect(activeTokens(undefined)).toEqual([])
    expect(activeTokens(null)).toEqual([])
  })
})

describe('prevWeekendDateIso', () => {
  it('gaat exact zeven dagen terug', () => {
    const now = new Date('2026-06-14T12:00:00.000Z')
    const prev = new Date(prevWeekendDateIso(now))
    expect(now.getTime() - prev.getTime()).toBe(7 * 24 * 3600 * 1000)
  })
})
