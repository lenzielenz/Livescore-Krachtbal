import { describe, it, expect } from 'vitest'

import { aantalOp, speeldagenRond, volgendeSpeeldag, vorigeSpeeldag, type Speeldag } from '@/lib/speeldagen'

// Een krachtbalcompetitie speelt in het weekend: tussen twee speeldagen zitten vier lege dagen.
const DAGEN: Speeldag[] = [
  { datum: '2026-09-05', aantal: 6 },
  { datum: '2026-09-06', aantal: 11 },
  { datum: '2026-09-12', aantal: 8 },
  { datum: '2026-09-13', aantal: 9 },
  { datum: '2026-09-19', aantal: 7 },
]

describe('volgende/vorige speeldag', () => {
  it('springt over de lege dagen heen', () => {
    expect(volgendeSpeeldag(DAGEN, '2026-09-06')).toBe('2026-09-12')
    expect(vorigeSpeeldag(DAGEN, '2026-09-12')).toBe('2026-09-06')
  })

  it('werkt ook vanaf een dag zonder wedstrijden', () => {
    expect(volgendeSpeeldag(DAGEN, '2026-09-09')).toBe('2026-09-12')
    expect(vorigeSpeeldag(DAGEN, '2026-09-09')).toBe('2026-09-06')
  })

  it('geeft null aan de randen — dan hoort de pijl uit te staan', () => {
    expect(volgendeSpeeldag(DAGEN, '2026-09-19')).toBeNull()
    expect(volgendeSpeeldag(DAGEN, '2027-01-01')).toBeNull()
    expect(vorigeSpeeldag(DAGEN, '2026-09-05')).toBeNull()
    expect(vorigeSpeeldag(DAGEN, '2020-01-01')).toBeNull()
  })

  it('geeft null bij een lege kalender', () => {
    expect(volgendeSpeeldag([], '2026-09-06')).toBeNull()
    expect(vorigeSpeeldag([], '2026-09-06')).toBeNull()
  })
})

describe('aantalOp', () => {
  it('geeft het aantal wedstrijden van die dag, anders 0', () => {
    expect(aantalOp(DAGEN, '2026-09-06')).toBe(11)
    expect(aantalOp(DAGEN, '2026-09-07')).toBe(0)
  })
})

describe('speeldagenRond', () => {
  it('toont een venster rond de gekozen dag', () => {
    const uit = speeldagenRond(DAGEN, '2026-09-12', 1, 1)
    expect(uit.map((d) => d.datum)).toEqual(['2026-09-06', '2026-09-12'])
  })

  it('houdt de gekozen dag erbij, ook zonder wedstrijden', () => {
    const uit = speeldagenRond(DAGEN, '2026-09-09', 1, 1)
    expect(uit.map((d) => d.datum)).toEqual(['2026-09-06', '2026-09-09', '2026-09-12'])
    expect(uit.find((d) => d.datum === '2026-09-09')?.aantal).toBe(0)
  })

  it('blijft binnen de grenzen van de kalender', () => {
    expect(speeldagenRond(DAGEN, '2026-09-05', 5, 2).map((d) => d.datum)).toEqual([
      '2026-09-05',
      '2026-09-06',
    ])
    expect(speeldagenRond([], '2026-09-05').map((d) => d.datum)).toEqual(['2026-09-05'])
  })
})
