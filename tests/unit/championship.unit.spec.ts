import { describe, it, expect } from 'vitest'

import { clinchStatus, titelBoodschap } from '@/lib/championship'
import type { StandingRow } from '@/lib/standings'

const row = (teamId: number, points: number): StandingRow => ({
  teamId,
  played: 0,
  won: 0,
  drawn: 0,
  lost: 0,
  forfaits: 0,
  goalsFor: 0,
  goalsAgainst: 0,
  diff: 0,
  points,
})

describe('clinchStatus', () => {
  it('is kampioen wanneer geen enkele tegenstander nog kan bijbenen', () => {
    // Leider 40 ptn, 0 resterend; rivaal 30 ptn met 2 resterend -> max 38 < 40.
    const standings = [row(1, 40), row(2, 30), row(3, 28)]
    const remaining = new Map([
      [1, 0],
      [2, 2],
      [3, 2],
    ])
    const s = clinchStatus(standings, remaining, 1)!
    expect(s.clinched).toBe(true)
    expect(s.pointsToClinch).toBe(0)
    expect(s.leading).toBe(true)
  })

  it('berekent het aantal punten tot de titel wanneer nog niet zeker', () => {
    // Leider 30 ptn met 3 resterend; rivaal 26 ptn met 3 resterend -> max 38. Nodig: 38-30+1 = 9.
    const standings = [row(1, 30), row(2, 26)]
    const remaining = new Map([
      [1, 3],
      [2, 3],
    ])
    const s = clinchStatus(standings, remaining, 1)!
    expect(s.clinched).toBe(false)
    expect(s.pointsToClinch).toBe(9)
    expect(s.winsToClinch).toBe(3)
    expect(s.leading).toBe(true)
  })

  it('geeft pointsToClinch null als het wiskundig nog niet te verzekeren valt', () => {
    // Leider 20 met 1 resterend (max +4); rivaal 19 met 3 resterend -> max 31. Nodig 12 > 4.
    const standings = [row(1, 20), row(2, 19)]
    const remaining = new Map([
      [1, 1],
      [2, 3],
    ])
    const s = clinchStatus(standings, remaining, 1)!
    expect(s.clinched).toBe(false)
    expect(s.pointsToClinch).toBeNull()
  })

  it('kampioen op het einde van het seizoen (geen resterende wedstrijden) bovenaan', () => {
    const standings = [row(1, 34), row(2, 32)]
    const remaining = new Map([
      [1, 0],
      [2, 0],
    ])
    const s = clinchStatus(standings, remaining, 1)!
    expect(s.clinched).toBe(true)
  })
})

describe('titelBoodschap', () => {
  const status = (over: Partial<ReturnType<typeof clinchStatus>> = {}) => ({
    rank: 1,
    points: 30,
    remaining: 3,
    clinched: false,
    leading: true,
    pointsToClinch: 9,
    winsToClinch: 3,
    ...over,
  })

  it('meldt de kampioen', () => {
    const m = titelBoodschap({ status: status({ clinched: true, winsToClinch: 0, pointsToClinch: 0 }), leaderName: 'Sint-Gillis', reeksLabel: '1ste Nationale Heren', teamsInTable: 8 })
    expect(m).toEqual({ text: 'Sint-Gillis is wiskundig kampioen van 1ste Nationale Heren.', clinched: true })
  })

  it('meldt hoeveel zeges de leider nog nodig heeft', () => {
    const m = titelBoodschap({ status: status(), leaderName: 'Sint-Gillis', reeksLabel: 'Landelijke Dames', teamsInTable: 8 })
    expect(m?.clinched).toBe(false)
    expect(m?.text).toBe('Sint-Gillis leidt en heeft nog 3 zeges nodig om de titel te verzekeren.')
  })

  it('gebruikt enkelvoud bij één zege', () => {
    const m = titelBoodschap({ status: status({ winsToClinch: 1, pointsToClinch: 4 }), leaderName: 'Sint-Gillis', reeksLabel: 'LH', teamsInTable: 8 })
    expect(m?.text).toContain('nog 1 zege nodig')
  })

  it('zwijgt wanneer de titel nog niet te verzekeren valt (begin seizoen)', () => {
    const m = titelBoodschap({ status: status({ winsToClinch: null, pointsToClinch: null }), leaderName: 'Sint-Gillis', reeksLabel: 'LH', teamsInTable: 8 })
    expect(m).toBeNull()
  })

  it('zwijgt zonder leider, zonder status of bij één ploeg in de stand', () => {
    expect(titelBoodschap({ status: status(), leaderName: null, reeksLabel: 'LH', teamsInTable: 8 })).toBeNull()
    expect(titelBoodschap({ status: null, leaderName: 'X', reeksLabel: 'LH', teamsInTable: 8 })).toBeNull()
    expect(titelBoodschap({ status: status({ clinched: true }), leaderName: 'X', reeksLabel: 'LH', teamsInTable: 1 })).toBeNull()
  })

  it('zwijgt wanneer de leider niets meer te spelen heeft maar (nog) geen kampioen is', () => {
    const m = titelBoodschap({ status: status({ remaining: 0 }), leaderName: 'X', reeksLabel: 'LH', teamsInTable: 8 })
    expect(m).toBeNull()
  })
})
