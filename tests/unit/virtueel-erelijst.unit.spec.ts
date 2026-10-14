import { describe, expect, it } from 'vitest'

import { eregalerij, rangtelwoord } from '@/lib/virtueel-erelijst'

// De hall of fame in de gangen van Virtueel krachtbal.

const data = {
  kampioenenSeizoenen: [
    { seizoen: '2023-2024', reeksen: [{ reeksNaam: '1ste Nationale Heren', kampioen: 'KBC St. Michiels' }, { reeksNaam: 'Dames', kampioen: 'KBC Male' }] },
    { seizoen: '2019-2020', reeksen: [{ reeksNaam: 'Dames', kampioen: '?' }] },
    { seizoen: '2015-2016', reeksen: [{ reeksNaam: 'Beloften', kampioen: 'KBC St. Michiels' }] },
  ],
  bekerwinnaarsSeizoenen: [{ seizoen: '2021-2022', winnaars: [{ categorie: 'Heren', ploeg: 'KBC St. Michiels' }] }],
  referendumPrijzen: [{ prijs: 'Gouden Bal', winnaars: [{ jaar: '2024', naam: 'Fien D.', club: 'KBC St. Michiels' }, { jaar: '2023', naam: 'Jan P.', club: 'KBC Male' }] }],
}

describe('eregalerij', () => {
  it('hangt de prijzen van je eigen club op, recentste eerst', () => {
    const z = eregalerij('KBC St. Michiels', data)!
    expect(z.eigen).toBe(true)
    expect(z.kop).toBe('HALL OF FAME · KBC ST. MICHIELS')
    expect(z.totaal).toBe('2 titels · 1 beker · 1 laureaat')
    expect(z.borden.map((b) => b.soort)).toEqual(['titel', 'referendum', 'beker', 'titel'])
    expect(z.borden[1]).toMatchObject({ soort: 'referendum', jaar: '2024', kop: 'GOUDEN BAL', tekst: 'Fien D.' })
  })

  it('negeert hoofdletters en leestekens in de clubnaam', () => {
    expect(eregalerij('kbc st michiels', data)?.eigen).toBe(true)
  })

  it('toont zonder club (of zonder prijzen) de recentste kampioenen van de federatie, zonder placeholders', () => {
    for (const club of [null, 'KBK Nergens']) {
      const z = eregalerij(club, data)!
      expect(z.eigen).toBe(false)
      expect(z.borden.map((b) => b.kop)).toEqual(['KBC ST. MICHIELS', 'KBC MALE', 'KBC ST. MICHIELS'])
    }
  })

  it('beperkt het aantal borden', () => {
    expect(eregalerij('KBC St. Michiels', data, 2)!.borden).toHaveLength(2)
  })

  it('geeft null zonder enige erelijst', () => {
    expect(eregalerij(null, { kampioenenSeizoenen: [], bekerwinnaarsSeizoenen: [], referendumPrijzen: [] })).toBeNull()
  })
})

describe('details op de borden', () => {
  it('nummert titels per reeks en voor de club', () => {
    const z = eregalerij('KBC St. Michiels', data)!
    const titels = z.borden.filter((b) => b.soort === 'titel')
    expect(titels.map((b) => b.extra)).toEqual(['1ste titel in 1ste Nationale Heren · 2de titel van de club', '1ste titel in Beloften · 1ste titel van de club'])
    expect(titels.map((b) => b.nummer)).toEqual([2, 1])
  })
  it('noemt de prijs en de laureaat bij een persoonlijke prijs', () => {
    const z = eregalerij('KBC St. Michiels', data)!
    expect(z.borden.find((b) => b.soort === 'referendum')?.extra).toBe('1ste Gouden Bal voor de club · 1ste laureaat van de club')
  })
  it('telt een tweede prijs voor dezelfde speler', () => {
    const meer = { ...data, referendumPrijzen: [{ prijs: 'Gouden Bal', winnaars: [{ jaar: '2024', naam: 'Fien D.', club: 'KBC St. Michiels' }, { jaar: '2022', naam: 'Fien D.', club: 'KBC St. Michiels' }] }] }
    expect(eregalerij('KBC St. Michiels', meer)!.borden.find((b) => b.jaar === '2024')?.extra).toBe('2de Gouden Bal voor de club · 2de keer voor Fien D.')
  })
  it('kent de Nederlandse rangtelwoorden', () => {
    expect([1, 2, 3, 7, 8, 9, 19, 20, 21, 100].map(rangtelwoord)).toEqual(['1ste', '2de', '3de', '7de', '8ste', '9de', '19de', '20ste', '21ste', '100ste'])
  })
})
