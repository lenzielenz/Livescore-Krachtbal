import { describe, expect, it } from 'vitest'

import { isBelofte, kiesbaarVoor, leeftijdOp, stemFouten, stemgerechtigd, telUitslag, type Kandidaat } from '@/lib/referendum'

const k = (id: number, clubId: number, extra: Partial<Kandidaat> = {}): Kandidaat => ({
  id,
  naam: `Speler ${id}`,
  clubId,
  clubNaam: `Club ${clubId}`,
  gespeeld: 10,
  ...extra,
})
const kandidaten = [k(1, 1), k(2, 1), k(3, 2), k(4, 2), k(5, 3), k(6, 3), k(7, 4), k(8, 4)]
const stemmer = { id: 1, clubId: 1 }
const goed = [
  { speler: 3, punten: 5 },
  { speler: 4, punten: 4 },
  { speler: 5, punten: 3 },
  { speler: 6, punten: 2 },
  { speler: 7, punten: 1 },
]

describe('referendum', () => {
  it('minimum 5 wedstrijden', () => {
    expect(stemgerechtigd(4)).toBe(false)
    expect(stemgerechtigd(5)).toBe(true)
  })

  it('niet op jezelf en niet op de eigen club', () => {
    expect(kiesbaarVoor(stemmer, kandidaten).map((x) => x.id)).toEqual([3, 4, 5, 6, 7, 8])
    expect(stemFouten(goed, stemmer, kandidaten)).toEqual([])
    expect(stemFouten([{ speler: 2, punten: 5 }, ...goed.slice(1)], stemmer, kandidaten)).toEqual(['Speler 2 is van je eigen club.'])
    expect(stemFouten([{ speler: 1, punten: 5 }, ...goed.slice(1)], stemmer, kandidaten)).toEqual(['Je kan niet op jezelf stemmen.'])
  })

  it('precies vijf spelers met 5, 4, 3, 2 en 1 punt', () => {
    expect(stemFouten(goed.slice(0, 4), stemmer, kandidaten)).toContain('Kies precies 5 spelers.')
    expect(stemFouten(goed.map((r) => ({ ...r, punten: 5 })), stemmer, kandidaten)).toContain('Geef elk van de punten 5, 4, 3, 2 en 1 precies één keer.')
    expect(stemFouten([...goed.slice(0, 4), { speler: 3, punten: 1 }], stemmer, kandidaten)).toContain('Elke speler maar één keer.')
    expect(stemFouten([...goed.slice(0, 4), { speler: 999, punten: 1 }], stemmer, kandidaten)).toContain('Een gekozen speler doet niet mee in jouw competitie.')
  })

  it('telt op, en bij gelijke stand telt wie meer keer 5 kreeg', () => {
    const u = telUitslag(
      [
        { stemmer: 1, regels: goed },
        { stemmer: 2, regels: [{ speler: 4, punten: 5 }, { speler: 3, punten: 4 }, { speler: 5, punten: 3 }, { speler: 6, punten: 2 }, { speler: 7, punten: 1 }] },
        { stemmer: 8, regels: [{ speler: 3, punten: 5 }, { speler: 4, punten: 4 }, { speler: 1, punten: 3 }, { speler: 2, punten: 2 }, { speler: 6, punten: 1 }] },
      ],
      kandidaten,
    )
    expect(u[0]).toMatchObject({ id: 3, totaal: 14 })
    expect(u[1]).toMatchObject({ id: 4, totaal: 13 })
    // 5 en 1 hebben elk... 5: 3+3 = 6; 6: 2+2+1 = 5; 1: 3
    expect(u.find((r) => r.id === 5)?.totaal).toBe(6)
  })

  it('belofte: jonger dan de grens op de peildatum', () => {
    const peil = new Date('2027-06-30T00:00:00Z')
    expect(leeftijdOp('2006-07-01', peil)).toBe(20)
    expect(leeftijdOp('2006-06-30', peil)).toBe(21)
    expect(isBelofte({ geboortedatum: '2006-07-01' }, peil)).toBe(true)
    expect(isBelofte({ geboortedatum: '2006-06-30' }, peil)).toBe(false)
    expect(isBelofte({ geboortedatum: null }, peil)).toBe(false)
  })
})
