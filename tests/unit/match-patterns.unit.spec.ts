import { describe, it, expect } from 'vitest'

import { detectMatchPatterns } from '@/lib/match-patterns'
import type { MatchStats, PlayerStats } from '@/lib/stats'

const mk = (over: Partial<PlayerStats> & Pick<PlayerStats, 'playerId' | 'shirtNumber' | 'teamSide'>): PlayerStats => ({
  playerId: over.playerId,
  playerName: over.playerName ?? `Speler ${over.shirtNumber}`,
  shirtNumber: over.shirtNumber,
  teamSide: over.teamSide,
  throws: over.throws ?? 6,
  order: over.order ?? { first: 0, second: 0, last: 0 },
  ground: 0,
  caught: 0,
  out: 0,
  lost: over.lost ?? 0,
  goalAttempts: over.goalAttempts ?? 0,
  conversion: over.conversion ?? 0,
  score: over.score ?? 0,
  byType: over.byType ?? { nek: 6, rug: 0 },
  goals: over.goals ?? { nek: 0, rug: 0, total: 0, points: 0 },
  distance: over.distance ?? { avg: 10, max: 14 },
  zones: over.zones ?? { links: 2, midden: 2, rechts: 2 },
})

const stats = (players: PlayerStats[]): MatchStats => ({
  players,
  teams: { home: { throws: 0, goals: 0, points: 0, avgDistance: 0, maxDistance: 0, caughtRatio: 0 }, away: { throws: 0, goals: 0, points: 0, avgDistance: 0, maxDistance: 0, caughtRatio: 0 } },
})

describe('detectMatchPatterns', () => {
  it('herkent een vaste afwerker (meeste doelworpen)', () => {
    const p = detectMatchPatterns(
      stats([
        mk({ playerId: 1, shirtNumber: 7, teamSide: 'home', order: { first: 1, second: 1, last: 5 } }),
        mk({ playerId: 2, shirtNumber: 9, teamSide: 'home', order: { first: 4, second: 2, last: 1 } }),
      ]),
    )
    const fin = p.find((x) => x.kind === 'afwerker')
    expect(fin).toBeTruthy()
    expect(fin?.shirtNumber).toBe(7)
    expect(fin?.detail).toContain('5 van 6')
  })

  it('herkent een vaste opzetter', () => {
    const p = detectMatchPatterns(
      stats([
        mk({ playerId: 1, shirtNumber: 7, teamSide: 'home', order: { first: 5, second: 1, last: 1 } }),
        mk({ playerId: 2, shirtNumber: 9, teamSide: 'home', order: { first: 1, second: 2, last: 4 } }),
      ]),
    )
    const st = p.find((x) => x.kind === 'opzetter')
    expect(st?.shirtNumber).toBe(7)
  })

  it('herkent een voorspelbare zone en een rugworp-gewoonte', () => {
    const p = detectMatchPatterns(
      stats([
        mk({ playerId: 3, shirtNumber: 11, teamSide: 'away', throws: 8, zones: { links: 0, midden: 1, rechts: 7 }, byType: { nek: 1, rug: 7 } }),
      ]),
    )
    expect(p.some((x) => x.kind === 'zone' && x.shirtNumber === 11)).toBe(true)
    expect(p.some((x) => x.kind === 'rug' && x.shirtNumber === 11)).toBe(true)
  })

  it('vindt geen patronen bij een gelijkmatig verdeelde ploeg', () => {
    const p = detectMatchPatterns(
      stats([
        mk({ playerId: 1, shirtNumber: 7, teamSide: 'home', throws: 4, order: { first: 2, second: 1, last: 1 }, zones: { links: 1, midden: 2, rechts: 1 } }),
        mk({ playerId: 2, shirtNumber: 9, teamSide: 'home', throws: 4, order: { first: 1, second: 1, last: 2 }, zones: { links: 2, midden: 1, rechts: 1 } }),
        mk({ playerId: 3, shirtNumber: 4, teamSide: 'home', throws: 4, order: { first: 1, second: 2, last: 1 }, zones: { links: 1, midden: 1, rechts: 2 } }),
      ]),
    )
    expect(p).toEqual([])
  })
})
