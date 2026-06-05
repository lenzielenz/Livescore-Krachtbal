import { describe, it, expect } from 'vitest'

import { winProbability, totalSecondsFor, type WinProbInput } from '@/lib/win-probability'

const base: Omit<WinProbInput, 'scoreHome' | 'scoreAway' | 'elapsedSec'> = {
  totalSec: 50 * 60, // 2×25 min
  ratePerMin: 0.5,
}
const wp = (scoreHome: number, scoreAway: number, elapsedSec: number) =>
  winProbability({ ...base, scoreHome, scoreAway, elapsedSec })

describe('winProbability', () => {
  it('kansen sommeren altijd tot 1', () => {
    for (const [h, a, e] of [
      [0, 0, 0],
      [5, 3, 600],
      [12, 12, 2400],
      [20, 8, 2900],
    ] as const) {
      const p = wp(h, a, e)
      expect(p.home + p.draw + p.away).toBeCloseTo(1, 6)
    }
  })

  it('gelijke stand bij aanvang ≈ symmetrisch (50/50 over de winnaars)', () => {
    const p = wp(0, 0, 0)
    expect(p.home).toBeCloseTo(p.away, 6)
    expect(p.home).toBeGreaterThan(0.3)
  })

  it('winstkans stijgt monotoon met de voorsprong', () => {
    const elapsed = 25 * 60
    const lead0 = wp(10, 10, elapsed).home
    const lead2 = wp(12, 10, elapsed).home
    const lead5 = wp(15, 10, elapsed).home
    expect(lead2).toBeGreaterThan(lead0)
    expect(lead5).toBeGreaterThan(lead2)
  })

  it('is symmetrisch: voorsprong thuis spiegelt voorsprong uit', () => {
    const elapsed = 30 * 60
    const home = wp(14, 10, elapsed)
    const away = wp(10, 14, elapsed)
    expect(home.home).toBeCloseTo(away.away, 6)
    expect(home.away).toBeCloseTo(away.home, 6)
    expect(home.draw).toBeCloseTo(away.draw, 6)
  })

  it('bij t=0 klapt de kans samen op de uitslag', () => {
    const full = 50 * 60
    expect(wp(15, 10, full)).toMatchObject({ home: 1, draw: 0, away: 0 })
    expect(wp(10, 15, full)).toMatchObject({ home: 0, draw: 0, away: 1 })
    expect(wp(12, 12, full)).toMatchObject({ home: 0, draw: 1, away: 0 })
  })

  it('een vroege voorsprong is nog niet beslist (kans < 100%)', () => {
    const p = wp(6, 0, 5 * 60) // +6 na 5 min
    expect(p.home).toBeLessThan(1)
    expect(p.away).toBeGreaterThan(0)
  })

  it('dezelfde voorsprong weegt zwaarder naarmate de tijd vordert', () => {
    const early = wp(13, 10, 5 * 60).home
    const late = wp(13, 10, 45 * 60).home
    expect(late).toBeGreaterThan(early)
  })

  it('verwachte eindstand ligt op of boven de huidige stand en behoudt de voorsprong', () => {
    const p = wp(8, 5, 25 * 60)
    expect(p.expHome).toBeGreaterThanOrEqual(8)
    expect(p.expAway).toBeGreaterThanOrEqual(5)
    expect(p.expHome - p.expAway).toBe(3)
  })

  it('totalSecondsFor verdubbelt de helftduur', () => {
    expect(totalSecondsFor(25 * 60)).toBe(50 * 60)
    expect(totalSecondsFor(20 * 60)).toBe(40 * 60)
  })
})
