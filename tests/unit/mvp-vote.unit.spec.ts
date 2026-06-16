import { describe, it, expect } from 'vitest'

import { tallyMvp, seasonMvpAwards, type MvpCandidate, type MvpVoteRow } from '@/lib/mvp-vote'

const cands: MvpCandidate[] = [
  { playerId: 1, name: 'Jan', shirtNumber: 7, side: 'home' },
  { playerId: 2, name: 'Piet', shirtNumber: 4, side: 'home' },
  { playerId: 3, name: 'Sam', shirtNumber: 9, side: 'away' },
]

describe('tallyMvp', () => {
  it('zonder stemmen: 0 totaal, geen winnaar, alles 0%', () => {
    const r = tallyMvp(cands, {})
    expect(r.total).toBe(0)
    expect(r.winner).toBeNull()
    expect(r.standings.every((s) => s.pct === 0 && !s.leading)).toBe(true)
  })

  it('rangschikt op stemmen en berekent percentages + winnaar', () => {
    const r = tallyMvp(cands, { 1: 3, 2: 1, 3: 0 })
    expect(r.total).toBe(4)
    expect(r.standings[0].playerId).toBe(1)
    expect(r.standings[0].pct).toBe(75)
    expect(r.winner?.playerId).toBe(1)
  })

  it('gelijkstand bovenaan → geen enkele winnaar, beiden leidend', () => {
    const r = tallyMvp(cands, { 1: 2, 2: 2, 3: 1 })
    expect(r.winner).toBeNull()
    expect(r.standings.filter((s) => s.leading).map((s) => s.playerId).sort()).toEqual([1, 2])
  })

  it('negeert stemmen voor onbekende spelers', () => {
    const r = tallyMvp(cands, { 1: 2, 99: 50 })
    expect(r.total).toBe(2)
    expect(r.winner?.playerId).toBe(1)
  })

  it('bij gelijke stemmen sorteert op rugnummer', () => {
    const r = tallyMvp(cands, { 1: 1, 2: 1 })
    // Piet (#4) vóór Jan (#7) bij gelijke stemmen.
    expect(r.standings[0].playerId).toBe(2)
    expect(r.standings[1].playerId).toBe(1)
  })
})

describe('seasonMvpAwards', () => {
  const rows: MvpVoteRow[] = [
    // Wedstrijd 1: speler 1 wint (2 vs 1).
    { matchId: 1, playerId: 1, name: 'Jan', shirtNumber: 7 },
    { matchId: 1, playerId: 1, name: 'Jan', shirtNumber: 7 },
    { matchId: 1, playerId: 2, name: 'Piet', shirtNumber: 4 },
    // Wedstrijd 2: speler 1 wint opnieuw (1 vs 0 anderen).
    { matchId: 2, playerId: 1, name: 'Jan', shirtNumber: 7 },
    // Wedstrijd 3: gelijkstand 1-1 → geen winnaar, wel stemmen.
    { matchId: 3, playerId: 2, name: 'Piet', shirtNumber: 4 },
    { matchId: 3, playerId: 3, name: 'Sam', shirtNumber: 9 },
  ]

  it('telt winsten (geen winst bij gelijkstand) en stemmen per speler', () => {
    const a = seasonMvpAwards(rows)
    const jan = a.find((x) => x.playerId === 1)!
    expect(jan.wins).toBe(2)
    expect(jan.votes).toBe(3)
    expect(a[0].playerId).toBe(1) // meeste winsten bovenaan
    expect(a.find((x) => x.playerId === 2)?.wins).toBe(0)
    expect(a.find((x) => x.playerId === 3)?.votes).toBe(1)
  })
})
