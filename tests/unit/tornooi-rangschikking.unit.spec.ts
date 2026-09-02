import { describe, it, expect } from 'vitest'

import { standenVanDag, type RangschikkingMatch, type RangschikkingReeks } from '@/lib/tornooi-rangschikking'

// Alle standen van een tornooidag op één pagina.

const m = (
  tournamentId: number,
  home: string,
  away: string,
  h: number,
  a: number,
  status = 'finished',
): RangschikkingMatch => ({
  tournamentId,
  home,
  away,
  status,
  winner: h === a ? null : h > a ? 'home' : 'away',
  score: { home: h, away: a },
})

const reeks = (id: number, naam: string, format = 'roundrobin', champion: string | null = null): RangschikkingReeks =>
  ({ id, naam, format, champion })

describe('standen van een tornooidag', () => {
  it('rekent per reeks apart, met de ploegen uit de eigen wedstrijden', () => {
    const reeksen = [reeks(1, 'U14'), reeks(2, 'U16')]
    const matches = [
      m(1, 'A', 'B', 2, 0),
      m(1, 'A', 'C', 1, 1),
      m(2, 'X', 'Y', 0, 3),
    ]
    const uit = standenVanDag(reeksen, matches)
    expect(uit.map((r) => r.naam)).toEqual(['U14', 'U16'])
    // Winst 4, gelijkspel 3 → A staat op 7 en bovenaan.
    expect(uit[0].stand[0].team).toBe('A')
    expect(uit[0].stand[0].points).toBe(7)
    // De ploegen van de ene reeks lekken niet in de andere.
    expect(uit[1].stand.map((s) => s.team).sort()).toEqual(['X', 'Y'])
  })

  it('geeft een bekerschema geen tabel maar wel zijn winnaar', () => {
    const uit = standenVanDag([reeks(3, 'Beker', 'single', 'KBC Male')], [m(3, 'KBC Male', 'Avanti', 2, 1)])
    expect(uit[0].beker).toBe(true)
    expect(uit[0].stand).toEqual([])
    expect(uit[0].champion).toBe('KBC Male')
  })

  it('zegt of er al gespeeld is', () => {
    const nogNiet = standenVanDag([reeks(1, 'U14')], [m(1, 'A', 'B', 0, 0, 'pending')])
    expect(nogNiet[0].gespeeld).toBe(false)
    const wel = standenVanDag([reeks(1, 'U14')], [m(1, 'A', 'B', 1, 0)])
    expect(wel[0].gespeeld).toBe(true)
  })

  it('overleeft een reeks zonder wedstrijden', () => {
    const uit = standenVanDag([reeks(9, 'Leeg')], [])
    expect(uit[0].stand).toEqual([])
    expect(uit[0].gespeeld).toBe(false)
  })
})
