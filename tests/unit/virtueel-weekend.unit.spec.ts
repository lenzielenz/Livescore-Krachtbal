import { describe, expect, it } from 'vitest'

import { pasStandenToe, weekendDatum, weekendTelling, weekendZaal, type WeekendWedstrijd } from '@/lib/virtueel-weekend'

const w = (id: number, kickoff: string, status: string, o: Partial<WeekendWedstrijd> = {}): WeekendWedstrijd => ({
  id,
  reeks: '1ste Nationale Heren',
  time: kickoff.slice(11, 16),
  kickoff,
  status,
  score: { home: 3, away: 2 },
  home: { name: `Thuis ${id}`, clubId: 10 + id, colors: { primary: '#ff0000', secondary: '#ffffff' } },
  away: { name: `Uit ${id}`, clubId: 20 + id, colors: null },
  ...o,
})

// Zaterdag 17 en zondag 18 oktober 2026 (Belgische zomertijd: UTC+2).
const wedstrijden = [
  w(1, '2026-10-18T12:00:00.000Z', 'scheduled'),
  w(2, '2026-10-17T13:00:00.000Z', 'finished'),
  w(3, '2026-10-17T15:00:00.000Z', 'live', { score: { home: 1, away: 0 } }),
  w(4, '2026-10-18T09:00:00.000Z', 'scheduled', { home: { name: 'Sint-Michiels A', clubId: 7 } }),
  w(5, '2026-10-17T08:00:00.000Z', 'scheduled', { awaitingResult: true }),
]

describe('weekendZaal', () => {
  it('zet je eigen club eerst en de rest in volgorde van aftrap', () => {
    const z = weekendZaal(wedstrijden, { clubId: 7, zaterdag: '2026-10-17', bezig: false })
    expect(z.borden.map((b) => b.id)).toEqual([4, 5, 2, 3, 1])
    expect(z.borden[0].eigen).toBe(true)
    expect(z.borden[0].dag).toBe('ZO')
    expect(z.borden[2].dag).toBe('ZA')
  })

  it('toont enkel een stand bij live en gespeelde wedstrijden', () => {
    const z = weekendZaal(wedstrijden, { clubId: null, zaterdag: '2026-10-17', bezig: true })
    const per = new Map(z.borden.map((b) => [b.id, b]))
    expect(per.get(2)).toMatchObject({ status: 'gespeeld', score: { home: 3, away: 2 } })
    expect(per.get(3)).toMatchObject({ status: 'live', score: { home: 1, away: 0 } })
    expect(per.get(1)).toMatchObject({ status: 'gepland', score: null })
    expect(per.get(5)).toMatchObject({ status: 'wacht', score: null })
    expect(per.get(1)?.thuisKleur).toBe('#ff0000')
    expect(per.get(1)?.uitKleur).toMatch(/^#/)
  })

  it('telt over het hele weekend, ook boven de limiet', () => {
    const z = weekendZaal(wedstrijden, { clubId: null, zaterdag: '2026-10-17', bezig: false, max: 2 })
    expect(z.borden).toHaveLength(2)
    expect(z).toMatchObject({ totaal: 5, gespeeld: 1, live: 1 })
    expect(weekendTelling(z)).toBe('5 wedstrijden · 1 gespeeld · 1 live')
  })

  it('zonder wedstrijden', () => {
    const z = weekendZaal([], { clubId: 7, zaterdag: '2026-10-17', bezig: false })
    expect(z.borden).toEqual([])
    expect(weekendTelling(z)).toBe('Dit weekend wordt er niet gespeeld')
  })
})

describe('weekendDatum', () => {
  it('binnen één maand en over een maandgrens', () => {
    expect(weekendDatum('2026-10-17')).toBe('za 17 – zo 18 oktober')
    expect(weekendDatum('2026-10-31')).toBe('za 31 oktober – zo 1 november')
  })
})

describe('pasStandenToe', () => {
  const z = weekendZaal(wedstrijden, { clubId: null, zaterdag: '2026-10-17', bezig: true })
  const standen = wedstrijden.map((m) => ({ id: m.id, status: m.status, awaitingResult: !!m.awaitingResult, score: m.score }))

  it('geeft dezelfde zaal terug als er niets verandert', () => {
    expect(pasStandenToe(z, standen)).toBe(z)
  })

  it('werkt een doelpunt en een afgelopen wedstrijd bij, met de tellingen', () => {
    const nieuw = pasStandenToe(
      z,
      standen.map((s) => (s.id === 3 ? { ...s, status: 'finished', score: { home: 2, away: 0 } } : s.id === 1 ? { ...s, status: 'live', score: { home: 0, away: 0 } } : s)),
    )
    expect(nieuw).not.toBe(z)
    const per = new Map(nieuw.borden.map((b) => [b.id, b]))
    expect(per.get(3)).toMatchObject({ status: 'gespeeld', score: { home: 2, away: 0 } })
    expect(per.get(1)).toMatchObject({ status: 'live', score: { home: 0, away: 0 } })
    expect(nieuw).toMatchObject({ totaal: 5, gespeeld: 2, live: 1 })
  })
})
