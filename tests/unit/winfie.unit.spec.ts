import { describe, expect, it } from 'vitest'

import { winfieHeadline, winfieProgress, winfieVariant } from '@/lib/winfie'

describe('winfie', () => {
  it('bouwt een cumulatief scoreverloop met één- en tweepunters', () => {
    const progress = winfieProgress([
      { id: '1', kind: 'goal', half: 1, gameClock: 30, side: 'home', label: 'Doelpunt +1' },
      { id: '2', kind: 'timeout', half: 1, gameClock: 60, side: 'away', label: 'Time-out' },
      { id: '3', kind: 'goal', half: 2, gameClock: 20, side: 'away', label: 'Doelpunt +2' },
    ])
    expect(progress).toEqual([
      { home: 0, away: 0, half: 1, gameClock: 0 },
      { home: 1, away: 0, half: 1, gameClock: 30 },
      { home: 1, away: 2, half: 2, gameClock: 20 },
    ])
  })

  it('maakt passende winstkoppen', () => {
    expect(winfieHeadline('Male', 'Brugge', { home: 27, away: 20 })).toBe('Male OVERTUIGT')
    expect(winfieHeadline('Male', 'Brugge', { home: 20, away: 21 })).toBe('Brugge WINT DE THRILLER')
    expect(winfieHeadline('Male', 'Brugge', { home: 20, away: 20 })).toBe('PUNT GEDEELD')
  })

  it('kiest stabiel één van vier composities per wedstrijd en foto', () => {
    expect(winfieVariant(42, 7)).toBe(winfieVariant(42, 7))
    expect([0, 1, 2, 3]).toContain(winfieVariant(99))
  })
})
