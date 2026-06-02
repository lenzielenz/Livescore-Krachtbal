import { describe, it, expect } from 'vitest'

import {
  type Goal,
  buildBracket,
  deriveScore,
  loserName,
  nextPow2,
  resolveWinner,
  seedPositions,
  seededSlots,
  shuffle,
  winnerName,
} from '@/lib/tournament'

describe('nextPow2', () => {
  it('rondt af naar boven naar een macht van 2 (min. 2)', () => {
    expect(nextPow2(1)).toBe(2)
    expect(nextPow2(2)).toBe(2)
    expect(nextPow2(3)).toBe(4)
    expect(nextPow2(5)).toBe(8)
    expect(nextPow2(8)).toBe(8)
    expect(nextPow2(9)).toBe(16)
  })
})

describe('seedPositions', () => {
  it('seed 1 staat tegenover seed size in ronde 1', () => {
    expect(seedPositions(2)).toEqual([1, 2])
    expect(seedPositions(4)).toEqual([1, 4, 2, 3])
    expect(seedPositions(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
  })
})

describe('seededSlots', () => {
  it('vult bye-slots (seeds > aantal ploegen) met null bij de hoogste seeds', () => {
    // 3 ploegen → schema van 4, seed 4 = bye tegen seed 1.
    expect(seededSlots(['A', 'B', 'C'])).toEqual(['A', null, 'B', 'C'])
  })
  it('exacte macht van 2 → geen bye', () => {
    expect(seededSlots(['A', 'B', 'C', 'D'])).toEqual(['A', 'D', 'B', 'C'])
  })
})

describe('buildBracket — structuur', () => {
  it('4 ploegen: 2 halve finales + finale + kleine finale, juiste labels', () => {
    const m = buildBracket(['A', 'D', 'B', 'C'])
    const main = m.filter((x) => x.bracket === 'main')
    const third = m.filter((x) => x.bracket === 'third')
    expect(main).toHaveLength(3) // 2 halve finales + 1 finale
    expect(third).toHaveLength(1)
    expect(main.filter((x) => x.round === 1).map((x) => x.label)).toEqual(['Halve finale', 'Halve finale'])
    expect(main.find((x) => x.round === 2)?.label).toBe('Finale')
    expect(third[0].label).toBe('Kleine finale (3e plaats)')
  })

  it('halve finales verwijzen winnaar → finale en verliezer → kleine finale', () => {
    const m = buildBracket(['A', 'D', 'B', 'C'])
    const semis = m.filter((x) => x.bracket === 'main' && x.round === 1).sort((a, b) => a.position - b.position)
    expect(semis[0].winnerTo).toEqual({ round: 2, position: 0, slot: 'home', bracket: 'main' })
    expect(semis[1].winnerTo).toEqual({ round: 2, position: 0, slot: 'away', bracket: 'main' })
    expect(semis[0].loserTo).toEqual({ round: 2, position: 1, slot: 'home', bracket: 'third' })
    expect(semis[1].loserTo).toEqual({ round: 2, position: 1, slot: 'away', bracket: 'third' })
  })

  it('2 ploegen: enkel een finale, geen kleine finale', () => {
    const m = buildBracket(['A', 'B'])
    expect(m).toHaveLength(1)
    expect(m[0].label).toBe('Finale')
    expect(m[0].bracket).toBe('main')
  })

  it('8 ploegen: 4 kwart + 2 halve + finale + kleine finale = 8 wedstrijden', () => {
    const m = buildBracket(seededSlots(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']))
    expect(m).toHaveLength(8)
    expect(m.filter((x) => x.round === 1 && x.bracket === 'main')).toHaveLength(4)
    expect(m.find((x) => x.bracket === 'main' && x.round === 3)?.label).toBe('Finale')
  })

  it('weigert een niet-macht-van-2 slot-lijst', () => {
    expect(() => buildBracket(['A', 'B', 'C'])).toThrow()
  })
})

describe('buildBracket — bye-afhandeling', () => {
  it('ploeg met bye wint ronde 1 automatisch en schuift door naar de volgende ronde', () => {
    // 3 ploegen: A heeft bye (A vs null), B vs C.
    const m = buildBracket(seededSlots(['A', 'B', 'C']))
    const semis = m.filter((x) => x.bracket === 'main' && x.round === 1).sort((a, b) => a.position - b.position)
    const byeMatch = semis.find((x) => !x.home || !x.away)!
    expect(byeMatch.status).toBe('finished')
    expect(winnerName(byeMatch)).toBe('A')
    // A staat nu al in de finale-slot.
    const final = m.find((x) => x.bracket === 'main' && x.round === 2)!
    expect(final.home === 'A' || final.away === 'A').toBe(true)
  })
})

describe('deriveScore', () => {
  it('telt nekworpen (+1) en rugworpen (+2) per kant', () => {
    const goals: Goal[] = [
      { side: 'home', points: 2, half: 1, clock: 60, ts: 1 },
      { side: 'home', points: 1, half: 1, clock: 90, ts: 2 },
      { side: 'away', points: 1, half: 1, clock: 120, ts: 3 },
    ]
    expect(deriveScore(goals)).toEqual({ home: 3, away: 1 })
  })
  it('leeg → 0-0', () => {
    expect(deriveScore([])).toEqual({ home: 0, away: 0 })
  })
})

describe('resolveWinner', () => {
  it('hoogste stand wint', () => {
    expect(resolveWinner({ home: 5, away: 3 })).toBe('home')
    expect(resolveWinner({ home: 2, away: 7 })).toBe('away')
  })
  it('gelijkspel → expliciete keuze (anders null)', () => {
    expect(resolveWinner({ home: 4, away: 4 })).toBe(null)
    expect(resolveWinner({ home: 4, away: 4 }, 'away')).toBe('away')
  })
})

describe('winnerName / loserName', () => {
  it('geeft de juiste namen bij een afgewerkte wedstrijd', () => {
    const m = { home: 'A', away: 'B', winner: 'away' as const }
    expect(winnerName(m)).toBe('B')
    expect(loserName(m)).toBe('A')
  })
  it('zonder winnaar → null', () => {
    const m = { home: 'A', away: 'B', winner: null }
    expect(winnerName(m)).toBe(null)
    expect(loserName(m)).toBe(null)
  })
})

describe('shuffle', () => {
  it('behoudt alle elementen (permutatie)', () => {
    const seq = [0.1, 0.5, 0.9, 0.3, 0.7]
    let i = 0
    const out = shuffle(['A', 'B', 'C', 'D', 'E'], () => seq[i++ % seq.length])
    expect(out.slice().sort()).toEqual(['A', 'B', 'C', 'D', 'E'])
  })
})
