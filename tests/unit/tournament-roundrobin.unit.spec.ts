import { describe, it, expect } from 'vitest'

import { buildRoundRobin, computeStandings } from '@/lib/tournament'

describe('buildRoundRobin', () => {
  it('elk paar speelt één keer (n·(n-1)/2 wedstrijden)', () => {
    const m = buildRoundRobin(['A', 'B', 'C', 'D'])
    expect(m).toHaveLength(6)
    const pairs = m.map((x) => `${x.home}-${x.away}`).sort()
    expect(pairs).toEqual(['A-B', 'A-C', 'A-D', 'B-C', 'B-D', 'C-D'])
    expect(m.every((x) => x.winnerTo === null && x.loserTo === null && x.bracket === 'main')).toBe(true)
  })
})

describe('computeStandings (winst 4 · gelijk 3 · verlies 2)', () => {
  const teams = ['A', 'B', 'C']
  const M = (home: string, away: string, winner: 'home' | 'away' | null, h: number, a: number) => ({
    home, away, status: 'finished', winner, score: { home: h, away: a },
  })

  it('telt punten, saldo en sorteert', () => {
    const standings = computeStandings(
      [
        M('A', 'B', 'home', 3, 1), // A wint
        M('A', 'C', null, 2, 2), // gelijk
        M('B', 'C', 'away', 0, 1), // C wint
      ],
      teams,
    )
    const byTeam = Object.fromEntries(standings.map((s) => [s.team, s]))
    expect(byTeam.A.points).toBe(4 + 3) // winst + gelijk
    expect(byTeam.A.won).toBe(1)
    expect(byTeam.A.drawn).toBe(1)
    expect(byTeam.C.points).toBe(3 + 4) // gelijk + winst
    expect(byTeam.B.points).toBe(2 + 2) // 2× verlies
    // A en C hebben elk 7 ptn; A heeft beter doelsaldo (+2 vs C +1) → A eerst, B laatst.
    expect(standings[0].team).toBe('A')
    expect(standings[2].team).toBe('B')
  })

  it('negeert nog niet gespeelde wedstrijden', () => {
    const standings = computeStandings(
      [{ home: 'A', away: 'B', status: 'pending', winner: null, score: { home: 0, away: 0 } }],
      ['A', 'B'],
    )
    expect(standings.every((s) => s.played === 0 && s.points === 0)).toBe(true)
  })
})
