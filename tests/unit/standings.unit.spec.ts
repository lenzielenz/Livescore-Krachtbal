import { describe, it, expect } from 'vitest'

import { computeStandings, forfaitFromUitslag, forfaitScore, type StandingsMatch } from '@/lib/standings'

const m = (homeId: number, awayId: number, hg: number, ag: number, forfait: StandingsMatch['forfait'] = 'none'): StandingsMatch => ({
  homeId,
  awayId,
  homeGoals: hg,
  awayGoals: ag,
  forfait,
})

describe('forfaitScore (vaste forfait-uitslag)', () => {
  it('thuis gaf forfait → 0–30; bezoekers → 30–0; dubbel → 0–0', () => {
    expect(forfaitScore('thuis')).toEqual({ home: 0, away: 30 })
    expect(forfaitScore('uit')).toEqual({ home: 30, away: 0 })
    expect(forfaitScore('dubbel')).toEqual({ home: 0, away: 0 })
  })
  it('geen forfait → null', () => {
    expect(forfaitScore('geen')).toBeNull()
    expect(forfaitScore(undefined)).toBeNull()
  })
})

describe('forfaitFromUitslag', () => {
  it('vertaalt de wedstrijdblad-aanduiding', () => {
    expect(forfaitFromUitslag('thuis')).toBe('home')
    expect(forfaitFromUitslag('uit')).toBe('away')
    expect(forfaitFromUitslag('dubbel')).toBe('both')
    expect(forfaitFromUitslag('geen')).toBe('none')
    expect(forfaitFromUitslag(undefined)).toBe('none')
  })
})

describe('computeStandings (winst 4 · gelijk 3 · verlies 2 · forfait 0)', () => {
  it('winst geeft 4, verlies 2', () => {
    const [first, second] = computeStandings([m(1, 2, 10, 6)])
    expect(first.teamId).toBe(1)
    expect(first).toMatchObject({ won: 1, lost: 0, points: 4, goalsFor: 10, goalsAgainst: 6, diff: 4 })
    expect(second).toMatchObject({ teamId: 2, lost: 1, points: 2, diff: -4 })
  })

  it('gelijkspel geeft elk 3', () => {
    const rows = computeStandings([m(1, 2, 8, 8)])
    expect(rows.every((r) => r.points === 3 && r.drawn === 1)).toBe(true)
  })

  it('forfait: forfaiter 0, tegenstander wint (4)', () => {
    const rows = computeStandings([m(1, 2, 0, 0, 'home')])
    const t1 = rows.find((r) => r.teamId === 1)!
    const t2 = rows.find((r) => r.teamId === 2)!
    expect(t1).toMatchObject({ forfaits: 1, points: 0, won: 0, lost: 0 })
    expect(t2).toMatchObject({ won: 1, points: 4 })
  })

  it('dubbel forfait: beide 0 punten', () => {
    const rows = computeStandings([m(1, 2, 0, 0, 'both')])
    expect(rows.every((r) => r.points === 0 && r.forfaits === 1)).toBe(true)
  })

  it('sorteert op punten, dan doelsaldo, dan doelpunten voor', () => {
    // 1 en 3 winnen (4 ptn): 1 heeft beter saldo (+8 vs +2). 2 en 4 verliezen (2 ptn):
    // 4 heeft beter saldo (−2 vs −8). Dus: 1, 3, 4, 2.
    const table = computeStandings([m(1, 2, 12, 4), m(3, 4, 8, 6)], [1, 2, 3, 4])
    expect(table.map((r) => r.teamId)).toEqual([1, 3, 4, 2])
    expect(table[0].points).toBe(4)
  })

  it('neemt ploegen zonder wedstrijden mee (0 op alles)', () => {
    const table = computeStandings([], [5, 6])
    expect(table).toHaveLength(2)
    expect(table.every((r) => r.played === 0 && r.points === 0)).toBe(true)
  })
})
