import { describe, it, expect } from 'vitest'

import { type StatThrow, aggregateStats } from '@/lib/stats'

const base: StatThrow = {
  playerId: 1,
  playerName: 'Jens',
  shirtNumber: 7,
  teamSide: 'home',
  throwNumber: 1,
  isLastThrow: false,
  type: 'nek',
  outcome: 'in_field',
  distance: null,
  zone: null,
}
const mk = (o: Partial<StatThrow>): StatThrow => ({ ...base, ...o })

describe('aggregateStats', () => {
  it('telt worpen, doelpunten en punten per speler', () => {
    const { players } = aggregateStats([
      mk({ type: 'rug', outcome: 'goal', isLastThrow: true, distance: 20, zone: 'midden' }),
      mk({ type: 'nek', outcome: 'goal', isLastThrow: true, distance: 10, zone: 'links' }),
      mk({ outcome: 'in_field', throwNumber: 1, distance: 5, zone: 'rechts' }),
    ])
    const p = players[0]
    expect(p.throws).toBe(3)
    expect(p.goals).toEqual({ nek: 1, rug: 1, total: 2, points: 3 })
    expect(p.zones).toEqual({ links: 1, midden: 1, rechts: 1 })
  })

  it('berekent gemiddelde en max afstand (enkel met afstand)', () => {
    const { players } = aggregateStats([
      mk({ distance: 10 }),
      mk({ distance: 20 }),
      mk({ distance: null }),
    ])
    expect(players[0].distance.avg).toBe(15)
    expect(players[0].distance.max).toBe(20)
  })

  it('grond vs gevangen', () => {
    const { players } = aggregateStats([
      mk({ outcome: 'caught' }),
      mk({ outcome: 'in_field' }),
      mk({ outcome: 'goal' }),
    ])
    expect(players[0].caught).toBe(1)
    expect(players[0].ground).toBe(2)
  })

  it('score = punten − gevangen (gevangen telt negatief)', () => {
    const { players } = aggregateStats([
      mk({ type: 'rug', outcome: 'goal' }), // +2
      mk({ outcome: 'caught' }), // -1
      mk({ outcome: 'caught' }), // -1
    ])
    expect(players[0].score).toBe(0)
  })

  it('negatieve score bij enkel gevangen worpen', () => {
    const { players } = aggregateStats([mk({ outcome: 'caught' }), mk({ outcome: 'caught' })])
    expect(players[0].score).toBe(-2)
  })

  it('verdeling 1e / 2e / laatste', () => {
    const { players } = aggregateStats([
      mk({ throwNumber: 1 }),
      mk({ throwNumber: 2 }),
      mk({ throwNumber: 3, isLastThrow: true }),
    ])
    expect(players[0].order).toEqual({ first: 1, second: 1, last: 1 })
  })

  it('aggregeert per ploeg', () => {
    const { teams } = aggregateStats([
      mk({ teamSide: 'home', type: 'rug', outcome: 'goal', distance: 30 }),
      mk({ playerId: 2, playerName: 'Milan', shirtNumber: 9, teamSide: 'away', outcome: 'caught' }),
    ])
    expect(teams.home.goals).toBe(1)
    expect(teams.home.points).toBe(2)
    expect(teams.home.maxDistance).toBe(30)
    expect(teams.away.throws).toBe(1)
    expect(teams.away.caughtRatio).toBe(1)
  })
})
