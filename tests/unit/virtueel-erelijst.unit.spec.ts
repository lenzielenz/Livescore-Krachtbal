import { describe, expect, it } from 'vitest'

import { eregalerij } from '@/lib/virtueel-erelijst'

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
    expect(z.borden[1]).toEqual({ soort: 'referendum', jaar: '2024', kop: 'GOUDEN BAL', tekst: 'Fien D.' })
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
