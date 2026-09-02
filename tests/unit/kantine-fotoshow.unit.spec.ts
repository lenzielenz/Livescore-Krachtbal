import { describe, it, expect } from 'vitest'

import { naStap, duurVan, volgendeFoto, ERE_MS, FOTO_MS } from '@/lib/kantine-fotoshow'

// De beurtrol op het kantinescherm na afloop van een tornooidag.
//
// Wat hier echt bewaakt wordt: dat een tv die de hele avond doorloopt niet vastraakt op dezelfde
// zes foto's, en dat de uitslagen regelmatig terugkomen. Beide zijn dingen die je pas ná drie uur
// kantine zou merken.

describe('nabeschouwing op het kantinescherm', () => {
  it('toont enkel de ereplaats zolang er geen foto’s zijn', () => {
    for (const n of [0, 1, 5, 99]) expect(naStap(n, 0)).toEqual({ soort: 'ereplaats' })
  })

  it('begint bij de uitslagen en laat er daarna foto’s op volgen', () => {
    expect(naStap(0, 10)).toEqual({ soort: 'ereplaats' })
    expect(naStap(1, 10)).toEqual({ soort: 'foto', index: 0 })
    expect(naStap(6, 10)).toEqual({ soort: 'foto', index: 5 })
    // Na zes foto's is het weer de beurt aan de kampioenen.
    expect(naStap(7, 10)).toEqual({ soort: 'ereplaats' })
  })

  it('gaat verder in de lijst in plaats van telkens dezelfde foto’s te herhalen', () => {
    // Dit is de fout die een avond kantine onbekijkbaar maakt: ronde twee opnieuw bij foto 0
    // beginnen, waardoor foto 7 tot en met 20 nooit op het scherm komen.
    expect(naStap(8, 20)).toEqual({ soort: 'foto', index: 6 })
    expect(naStap(9, 20)).toEqual({ soort: 'foto', index: 7 })
  })

  it('laat elke foto uiteindelijk aan bod komen', () => {
    const aantal = 17
    const gezien = new Set<number>()
    for (let n = 0; n < 400; n += 1) {
      const s = naStap(n, aantal)
      if (s.soort === 'foto') gezien.add(s.index)
    }
    expect(gezien.size).toBe(aantal)
  })

  it('herhaalt geen foto’s binnen één ronde als er minder foto’s dan plaatsen zijn', () => {
    // Drie foto's in een ronde van zes: zonder correctie zag je 0,1,2,0,1,2 vóór de uitslagen.
    expect(naStap(0, 3)).toEqual({ soort: 'ereplaats' })
    expect(naStap(1, 3)).toEqual({ soort: 'foto', index: 0 })
    expect(naStap(3, 3)).toEqual({ soort: 'foto', index: 2 })
    expect(naStap(4, 3)).toEqual({ soort: 'ereplaats' })
  })

  it('overleeft rare tellerwaarden', () => {
    expect(naStap(-5, 4)).toEqual({ soort: 'ereplaats' })
    expect(naStap(2.7, 4).soort).toBe('foto')
  })

  it('geeft de uitslagen meer tijd dan een foto', () => {
    expect(duurVan({ soort: 'ereplaats' })).toBe(ERE_MS)
    expect(duurVan({ soort: 'foto', index: 3 })).toBe(FOTO_MS)
    expect(ERE_MS).toBeGreaterThan(FOTO_MS)
  })

  it('wijst de foto aan die vooraf ingeladen moet worden', () => {
    expect(volgendeFoto(0, 10)).toBe(0)
    expect(volgendeFoto(1, 10)).toBe(1)
    // Na de laatste foto van de ronde komt de ereplaats: dan valt er niets voor te laden.
    expect(volgendeFoto(6, 10)).toBeNull()
    expect(volgendeFoto(0, 0)).toBeNull()
  })
})
