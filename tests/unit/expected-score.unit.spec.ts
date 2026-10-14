import { describe, expect, it } from 'vitest'

import { schatScore } from '@/lib/expected-score'
import type { StandingsMatch } from '@/lib/standings'

const NU = new Date('2026-10-14T12:00:00Z').getTime()
const dagenGeleden = (n: number) => new Date(NU - n * 24 * 60 * 60 * 1000).toISOString()
const m = (homeId: number, awayId: number, homeGoals: number, awayGoals: number, dagen = 7, forfait: StandingsMatch['forfait'] = 'none'): StandingsMatch => ({
  homeId, awayId, homeGoals, awayGoals, forfait, date: dagenGeleden(dagen),
})

// Een kleine reeks: 1 is sterk, 4 is zwak, 2 en 3 zitten ertussen.
const reeks: StandingsMatch[] = [
  m(1, 2, 20, 12), m(3, 4, 15, 10), m(1, 3, 18, 11), m(2, 4, 16, 9),
  m(1, 4, 22, 8), m(2, 3, 14, 14), m(2, 1, 11, 19), m(4, 3, 9, 16),
]

describe('schatScore', () => {
  it('geeft null zonder gespeelde wedstrijden', () => {
    expect(schatScore([], 1, 2, NU)).toBeNull()
    expect(schatScore([m(1, 2, 10, 0, 7, 'away')], 1, 2, NU)).toBeNull()
  })

  it('laat de sterke ploeg winnen, met een realistische score', () => {
    const s = schatScore(reeks, 1, 4, NU)!
    expect(s.home).toBeGreaterThan(s.away)
    expect(s.home).toBeGreaterThanOrEqual(18)
    expect(s.away).toBeLessThanOrEqual(10)
  })

  it('is symmetrisch genoeg: wissel thuis en uit en de sterke ploeg wint nog steeds', () => {
    const s = schatScore(reeks, 4, 1, NU)!
    expect(s.away).toBeGreaterThan(s.home)
  })

  it('houdt rekening met de tegenstanders: scoren tegen de leider telt zwaarder', () => {
    // 5 en 6 scoren allebei 15 per wedstrijd, maar 5 deed dat tegen de leider, 6 tegen de laatste.
    const extra = [...reeks, m(5, 1, 15, 15), m(6, 4, 15, 15)]
    const s5 = schatScore(extra, 5, 2, NU)!
    const s6 = schatScore(extra, 6, 2, NU)!
    expect(s5.home).toBeGreaterThan(s6.home)
  })

  it('laat recente vorm zwaarder wegen', () => {
    // Ploeg 7 scoorde lang geleden weinig, recent veel; ploeg 8 omgekeerd.
    const vorm = [...reeks, m(7, 2, 8, 15, 120), m(7, 3, 22, 12, 3), m(8, 2, 22, 12, 120), m(8, 3, 8, 15, 3)]
    expect(schatScore(vorm, 7, 4, NU)!.home).toBeGreaterThan(schatScore(vorm, 8, 4, NU)!.home)
  })

  it('valt voor een ploeg zonder wedstrijden terug op het reeksgemiddelde', () => {
    const s = schatScore(reeks, 9, 10, NU)!
    const gem = reeks.reduce((t, x) => t + x.homeGoals + x.awayGoals, 0) / (2 * reeks.length)
    expect(Math.abs(s.home - gem)).toBeLessThanOrEqual(2)
    expect(Math.abs(s.away - gem)).toBeLessThanOrEqual(2)
  })

  it('laat één uitschieter op de eerste speeldag niet ontsporen', () => {
    const s = schatScore([m(1, 2, 40, 2), m(3, 4, 15, 15)], 1, 3, NU)!
    expect(s.home).toBeLessThan(40)
  })

  it('negeert forfaits', () => {
    const metForfait = [...reeks, m(4, 1, 10, 0, 1, 'away')]
    expect(schatScore(metForfait, 1, 4, NU)).toEqual(schatScore(reeks, 1, 4, NU))
  })
})
