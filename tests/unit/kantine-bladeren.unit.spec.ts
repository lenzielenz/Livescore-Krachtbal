import { describe, expect, it } from 'vitest'

import { BLAD_GAT, MIN_BORD_H, bladIndeling } from '@/lib/kantine-bladeren'

// Hoogte die het venster van een kantine-tv ongeveer overhoudt, na de kop en de balken.
const TV_1080 = 880
const TV_KLEIN = 560

describe('bladIndeling', () => {
  it('laat weinig wedstrijden het volledige scherm vullen', () => {
    // De gewone zaterdag: twee live wedstrijden naast elkaar. Er is één rij, dus die rij hoort de
    // hele vensterhoogte te krijgen — niet de minimumhoogte met een zwart gat eronder.
    const r = bladIndeling({ aantal: 2, cols: 2, vensterH: TV_1080 })
    expect(r.rijenPerBlad).toBe(1)
    expect(r.bladen).toBe(1)
    expect(r.rijH).toBe(TV_1080)
  })

  it('vult het scherm ook bij meerdere rijen die samen op één blad passen', () => {
    const r = bladIndeling({ aantal: 4, cols: 2, vensterH: TV_1080 })
    expect(r.rijenPerBlad).toBe(2)
    expect(r.bladen).toBe(1)
    // Twee rijen plus de tussenruimte vullen het venster precies.
    expect(r.rijH * 2 + BLAD_GAT).toBeCloseTo(TV_1080)
  })

  it('bladert zodra er meer rijen nodig zijn dan er passen', () => {
    // Dertien wedstrijden op een klein scherm: drie rijen van drie per blad, dus twee bladen.
    const r = bladIndeling({ aantal: 13, cols: 3, vensterH: TV_KLEIN })
    expect(r.rijenPerBlad).toBe(3)
    expect(r.perBlad).toBe(9)
    expect(r.bladen).toBe(2)
  })

  it('houdt elke rij boven de leesbare minimumhoogte', () => {
    for (const aantal of [1, 2, 5, 9, 13, 40]) {
      for (const cols of [1, 2, 3, 4]) {
        for (const vensterH of [TV_KLEIN, TV_1080, 1400]) {
          const r = bladIndeling({ aantal, cols, vensterH })
          expect(r.rijH).toBeGreaterThanOrEqual(MIN_BORD_H)
        }
      }
    }
  })

  it('laat een blad nooit hoger worden dan het venster', () => {
    // Dit is de afknip-fout: de rijen van één blad plus hun tussenruimtes moeten in het venster
    // passen, anders knipt overflow:hidden de onderste rij door.
    for (const aantal of [1, 3, 8, 13, 27]) {
      for (const cols of [1, 2, 3, 4]) {
        for (const vensterH of [350, TV_KLEIN, TV_1080]) {
          const r = bladIndeling({ aantal, cols, vensterH })
          const bladH = r.rijH * r.rijenPerBlad + (r.rijenPerBlad - 1) * BLAD_GAT
          expect(bladH).toBeLessThanOrEqual(vensterH + 0.001)
        }
      }
    }
  })

  it('toont alle borden samen over de bladen', () => {
    for (const aantal of [0, 1, 7, 13, 100]) {
      const r = bladIndeling({ aantal, cols: 3, vensterH: TV_KLEIN })
      expect(r.perBlad * r.bladen).toBeGreaterThanOrEqual(aantal)
    }
  })

  it('houdt alles op één blad zolang het venster niet gemeten is', () => {
    // Eerste frame: nog geen hoogte. Dan mag er niets weggebladerd worden en horen er nog geen
    // bolletjes te staan — het component valt terug op de CSS-verdeling.
    const r = bladIndeling({ aantal: 13, cols: 3, vensterH: 0 })
    expect(r.bladen).toBe(1)
    expect(r.perBlad).toBe(13)
    expect(r.rijH).toBe(0)
  })

  it('valt terug op een geldige indeling bij onzin', () => {
    for (const opts of [
      { aantal: 0, cols: 0, vensterH: 0 },
      { aantal: -5, cols: -2, vensterH: -100 },
      { aantal: NaN, cols: NaN, vensterH: NaN },
    ]) {
      const r = bladIndeling(opts)
      expect(r.rijenPerBlad).toBeGreaterThanOrEqual(1)
      expect(r.perBlad).toBeGreaterThanOrEqual(1)
      expect(r.bladen).toBe(1)
      expect(r.rijH).toBeGreaterThanOrEqual(0)
    }
  })

  it('een scherm dat maar één rij aankan, bladert per rij', () => {
    const r = bladIndeling({ aantal: 6, cols: 2, vensterH: MIN_BORD_H + 10 })
    expect(r.rijenPerBlad).toBe(1)
    expect(r.perBlad).toBe(2)
    expect(r.bladen).toBe(3)
    expect(r.rijH).toBe(MIN_BORD_H + 10)
  })
})
