import { describe, it, expect } from 'vitest'

import { telClubTrofeeen, telLaureaten, zoekErelijst } from '@/lib/erelijst'
import type { KampioenenSeizoenInput, BekerwinnaarsSeizoenInput, ReferendumPrijsInput } from '@/lib/erelijst'

const kampioenen: KampioenenSeizoenInput[] = [
  { seizoen: '2024-2025', reeksen: [{ reeksNaam: 'Hogere Heren', kampioen: 'KBC Male' }, { reeksNaam: 'Hogere Dames', kampioen: 'KRB Jabbeke' }] },
  { seizoen: '2023-2024', reeksen: [{ reeksNaam: 'Hogere Heren', kampioen: 'KBC Male' }] },
  { seizoen: '2020-2021', reeksen: [{ reeksNaam: 'Alle reeksen', kampioen: 'Geen kampioenen' }] },
]

const bekerwinnaars: BekerwinnaarsSeizoenInput[] = [
  { seizoen: '2024-2025', winnaars: [{ categorie: 'Heren', ploeg: 'KBC Male' }, { categorie: 'Dames', ploeg: 'KRB Jabbeke' }] },
  { seizoen: '1970-1971', winnaars: [{ categorie: '(geen gegevens beschikbaar)', ploeg: '(geen gegevens)' }] },
]

const referendum: ReferendumPrijsInput[] = [
  {
    prijs: 'Speler van het jaar',
    winnaars: [
      { jaar: '2025', naam: 'Jason De Vooght', club: 'KBC St. Michiels' },
      { jaar: '2024', naam: 'Jason De Vooght', club: 'KBC St. Michiels' },
      { jaar: '2021', naam: 'Geen', club: 'COVID-19' },
    ],
  },
  {
    prijs: 'Belofte van het jaar (jongens)',
    winnaars: [{ jaar: '2025', naam: 'Kobe Sevenhant', club: 'KBC Male' }],
  },
]

describe('telClubTrofeeen', () => {
  it('telt titels, bekers én referendumprijzen van haar spelers per club, en sorteert op totaal', () => {
    const result = telClubTrofeeen(kampioenen, bekerwinnaars, referendum)
    const male = result.find((r) => r.naam === 'KBC Male')!
    expect(male.titels).toBe(2)
    expect(male.bekers).toBe(1)
    expect(male.referendumprijzen).toBe(1)
    expect(male.totaal).toBe(4)
    // KBC Male (4) moet vóór KRB Jabbeke (2) staan.
    expect(result[0].naam).toBe('KBC Male')
  })

  it('neemt een club op die enkel via referendumlaureaten prijzen heeft, zonder titel of beker', () => {
    const result = telClubTrofeeen(kampioenen, bekerwinnaars, referendum)
    const michiels = result.find((r) => r.naam === 'KBC St. Michiels')!
    expect(michiels.titels).toBe(0)
    expect(michiels.bekers).toBe(0)
    expect(michiels.referendumprijzen).toBe(2)
    expect(michiels.totaal).toBe(2)
  })

  it('negeert placeholder-winnaars (COVID, ontbrekende data)', () => {
    const result = telClubTrofeeen(kampioenen, bekerwinnaars, referendum)
    expect(result.some((r) => r.naam === 'Geen kampioenen')).toBe(false)
    expect(result.some((r) => r.naam === '(geen gegevens)')).toBe(false)
    expect(result.some((r) => r.naam === 'COVID-19')).toBe(false)
  })
})

describe('telLaureaten', () => {
  it('telt referendum-prijzen per persoon en houdt bij welke prijzen', () => {
    const result = telLaureaten(referendum)
    const jason = result.find((r) => r.naam === 'Jason De Vooght')!
    expect(jason.aantal).toBe(2)
    expect(jason.prijzen).toEqual(['Speler van het jaar'])
  })

  it('negeert COVID-placeholders', () => {
    const result = telLaureaten(referendum)
    expect(result.some((r) => r.naam === 'Geen')).toBe(false)
  })
})

describe('zoekErelijst', () => {
  it('geeft leeg resultaat bij lege query', () => {
    expect(zoekErelijst('', kampioenen, bekerwinnaars, referendum)).toEqual([])
  })

  it('vindt een club doorheen kampioenen én bekerwinnaars, hoofdletterongevoelig', () => {
    const result = zoekErelijst('kbc male', kampioenen, bekerwinnaars, referendum)
    expect(result.some((r) => r.type === 'kampioen' && r.naam === 'KBC Male')).toBe(true)
    expect(result.some((r) => r.type === 'beker' && r.naam === 'KBC Male')).toBe(true)
    expect(result.some((r) => r.type === 'referendum')).toBe(false)
  })

  it('vindt een speler in het referendumarchief op deelstring', () => {
    const result = zoekErelijst('vooght', kampioenen, bekerwinnaars, referendum)
    expect(result).toHaveLength(2)
    expect(result.every((r) => r.type === 'referendum')).toBe(true)
  })

  it('sorteert resultaten van recent naar oud', () => {
    const result = zoekErelijst('KBC Male', kampioenen, bekerwinnaars, referendum)
    const jaartallen = result.map((r) => (r.type === 'referendum' ? r.jaar : r.seizoen))
    // "2024-2025" (kampioen + beker) moet vóór "2023-2024" komen.
    expect(jaartallen[0]).toBe('2024-2025')
    expect(jaartallen[jaartallen.length - 1]).toBe('2023-2024')
  })

  it('negeert placeholders in zoekresultaten', () => {
    const result = zoekErelijst('geen gegevens', kampioenen, bekerwinnaars, referendum)
    expect(result).toEqual([])
  })
})
