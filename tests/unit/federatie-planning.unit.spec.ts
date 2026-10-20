import { describe, expect, it } from 'vitest'

import { maakKalender, roundRobin } from '@/lib/kalender-generator'
import { conflicten, MIN_TUSSENTIJD_MS, vulAutomatisch, type PlanWedstrijd } from '@/lib/scheidsrechter-planning'

const paren = (rondes: [number, number][][]) => rondes.flat().map(([a, b]) => `${a}-${b}`)

describe('kalender opmaken', () => {
  it('iedereen speelt één keer thuis en één keer uit tegen iedereen', () => {
    for (const n of [2, 4, 5, 6, 7, 10]) {
      const ids = Array.from({ length: n }, (_, i) => i + 1)
      const rondes = roundRobin(ids)
      const alle = paren(rondes)
      expect(alle.length).toBe(n * (n - 1))
      expect(new Set(alle).size).toBe(alle.length)
      for (const a of ids) for (const b of ids) if (a !== b) expect(alle).toContain(`${a}-${b}`)
      // Niemand speelt twee keer op dezelfde speeldag.
      for (const ronde of rondes) {
        const spelers = ronde.flat()
        expect(new Set(spelers).size).toBe(spelers.length)
      }
    }
  })

  it('thuis en uit blijven in balans in de heenronde', () => {
    const ids = [1, 2, 3, 4, 5, 6, 7, 8]
    const heen = roundRobin(ids, true)
    for (const id of ids) {
      const thuis = heen.flat().filter(([a]) => a === id).length
      expect(Math.abs(thuis - (ids.length - 1) / 2)).toBeLessThanOrEqual(1)
    }
  })

  it('oneven aantal: één ploeg is elke speeldag vrij', () => {
    const rondes = roundRobin([1, 2, 3, 4, 5], true)
    expect(rondes.length).toBe(5)
    for (const r of rondes) expect(r.length).toBe(2)
  })

  it('data, vrije weekends en het thuisuur', () => {
    const k = maakKalender(
      [
        { id: 1, naam: 'A', thuisUur: '11:30' },
        { id: 2, naam: 'B' },
        { id: 3, naam: 'C' },
        { id: 4, naam: 'D' },
      ],
      { start: '2026-09-13', vrij: ['2026-09-20'], standaardUur: '14:00' },
    )
    const dagen = [...new Set(k.map((w) => w.datum))]
    expect(dagen.slice(0, 3)).toEqual(['2026-09-13', '2026-09-27', '2026-10-04'])
    expect(dagen.length).toBe(6)
    const thuisA = k.find((w) => w.thuis === 1)!
    // 11:30 Brusselse zomertijd = 09:30 UTC
    expect(thuisA.aftrapUtc.slice(11, 16)).toBe('09:30')
    const thuisB = k.find((w) => w.thuis === 2)!
    expect(thuisB.aftrapUtc.slice(11, 16)).toBe('12:00')
  })
})

describe('scheidsrechters plannen', () => {
  const t0 = Date.UTC(2026, 9, 25, 12)
  const w = (matchId: number, uurNa: number, clubs: number[], scheidsrechter: number | null = null): PlanWedstrijd => ({
    matchId,
    dag: '2026-10-25',
    aftrap: t0 + uurNa * 3600_000,
    clubs,
    scheidsrechter,
  })
  const refs = [
    { id: 10, naam: 'Anna', club: 1 },
    { id: 11, naam: 'Bert', club: null },
    { id: 12, naam: 'Cas', club: 3 },
  ]

  it('meldt dubbel geboekt en fluiten bij de eigen club', () => {
    const c = conflicten([w(1, 0, [1, 2], 10), w(2, 1, [3, 4], 11), w(3, 2, [5, 6], 11)], refs)
    expect(c.find((x) => x.matchId === 1)?.reden).toBe('fluit bij de eigen club')
    expect(c.filter((x) => x.matchId === 2 || x.matchId === 3).length).toBe(2)
  })

  it('vult eerlijk, niet bij de eigen club en niet dubbel', () => {
    const plan = vulAutomatisch([w(1, 0, [1, 2]), w(2, 0, [3, 4]), w(3, 0, [5, 6]), w(4, 4, [1, 5])], refs)
    expect(conflicten(plan, refs)).toEqual([])
    expect(plan.filter((x) => x.scheidsrechter != null).length).toBe(4)
    expect(plan.find((x) => x.matchId === 1)?.scheidsrechter).not.toBe(10)
    expect(plan.find((x) => x.matchId === 2)?.scheidsrechter).not.toBe(12)
  })

  it('laat bestaande toewijzingen staan en laat leeg wat niet kan', () => {
    const plan = vulAutomatisch([w(1, 0, [5, 6], 11), w(2, 0, [1, 3]), w(3, 0, [7, 8]), w(4, 0, [9, 2])], refs)
    expect(plan.find((x) => x.matchId === 1)?.scheidsrechter).toBe(11)
    // Wedstrijd 2: Anna (club 1) en Cas (club 3) mogen niet, Bert is bezet → leeg.
    expect(plan.find((x) => x.matchId === 2)?.scheidsrechter).toBeNull()
    expect(MIN_TUSSENTIJD_MS).toBeGreaterThan(0)
  })
})
