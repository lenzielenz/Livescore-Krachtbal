import { describe, expect, it } from 'vitest'

import { rankDevBoard } from '@/lib/player-development-board'

const entry = (playerId: number, score: number) => ({ playerId, dev: { overall: { score } } })

describe('rankDevBoard', () => {
  it('sorteert aflopend op overall score', () => {
    const out = rankDevBoard([entry(1, 50), entry(2, 200), entry(3, 120)])
    expect(out.map((e) => e.playerId)).toEqual([2, 3, 1])
  })

  it('laat spelers zonder punten weg', () => {
    const out = rankDevBoard([entry(1, 0), entry(2, 30)])
    expect(out.map((e) => e.playerId)).toEqual([2])
  })

  it('dedupliceert op speler en houdt de hoogste score', () => {
    const out = rankDevBoard([entry(7, 40), entry(7, 90), entry(8, 60)])
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ playerId: 7, dev: { overall: { score: 90 } } })
    expect(out[1]).toMatchObject({ playerId: 8 })
  })
})
