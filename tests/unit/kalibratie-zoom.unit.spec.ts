import { describe, it, expect } from 'vitest'

import {
  MAX_ZOOM,
  beeldPerScherm,
  nauwkeurigheidM,
  naarBeeld,
  naarScherm,
  nodigeZoom,
  richtwinst,
  venster,
  vensterStijl,
} from '@/lib/kalibratie-zoom'

// Hier zit de hele nauwkeurigheid van de kalibratie in. Staat deze omrekening scheef, dan zit
// élk aangeduid punt ernaast en is daar in het scherm niets van te zien — de fout duikt pas op
// als de gemeten landing er meters naast ligt. Vandaar dat elke stap hier vastligt.

const HD = { breedte: 1920, hoogte: 1080 }
const TELEFOON = { breedte: 350, hoogte: 197 }

describe('beeldPerScherm', () => {
  it('legt de kern van het probleem bloot', () => {
    // Een HD-video in een vak van 350 px: één schermpixel is 5,5 beeldpixels. Met een duim die
    // 8 px nauwkeurig raakt zit je dus al 44 beeldpixels naast de kruising.
    expect(beeldPerScherm(HD, TELEFOON)).toBeCloseTo(5.486, 3)
  })

  it('daalt evenredig met de zoom', () => {
    expect(beeldPerScherm(HD, TELEFOON, 6)).toBeCloseTo(0.914, 3)
  })

  it('geeft nul terug bij onzinnige maten in plaats van oneindig', () => {
    expect(beeldPerScherm(HD, { breedte: 0, hoogte: 0 })).toBe(0)
    expect(beeldPerScherm({ breedte: 0, hoogte: 0 }, TELEFOON)).toBe(0)
  })
})

describe('nodigeZoom', () => {
  it('rekent uit hoeveel vergroting er nodig is voor subpixel-mikken', () => {
    // 5,486 beeldpixels per schermpixel → 6× vergroten brengt dat onder de 1.
    expect(nodigeZoom(HD, TELEFOON, 1)).toBe(6)
    expect(beeldPerScherm(HD, TELEFOON, nodigeZoom(HD, TELEFOON, 1))).toBeLessThanOrEqual(1)
  })

  it('vergroot niet als het niet hoeft', () => {
    // Een klein beeld in een groot vak staat al ruimer dan één op één.
    expect(nodigeZoom({ breedte: 640, hoogte: 360 }, { breedte: 1200, hoogte: 675 }, 1)).toBe(1)
  })

  it('blijft binnen de grenzen', () => {
    expect(nodigeZoom({ breedte: 8000, hoogte: 4000 }, { breedte: 100, hoogte: 50 }, 1)).toBe(MAX_ZOOM)
  })
})

describe('venster', () => {
  it('toont het hele beeld bij zoom 1', () => {
    expect(venster(HD, 1, { x: 960, y: 540 })).toEqual({ x: 0, y: 0, breedte: 1920, hoogte: 1080 })
  })

  it('houdt het venster binnen het beeld bij een middelpunt aan de rand', () => {
    // Zonder deze klem kijk je naar zwart terwijl je denkt de veldhoek te zien.
    const v = venster(HD, 4, { x: 10, y: 10 })
    expect(v.x).toBe(0)
    expect(v.y).toBe(0)
    const r = venster(HD, 4, { x: 1910, y: 1070 })
    expect(r.x + r.breedte).toBeCloseTo(1920, 6)
    expect(r.y + r.hoogte).toBeCloseTo(1080, 6)
  })
})

describe('naarBeeld', () => {
  it('rekent een tik in het midden om naar het midden van het beeld', () => {
    const p = naarBeeld({ x: 175, y: 98.5 }, TELEFOON, HD)
    expect(p.x).toBeCloseTo(960, 0)
    expect(p.y).toBeCloseTo(540, 0)
  })

  it('rekent bij zoom alleen het zichtbare venster om', () => {
    // 4× ingezoomd rond (400, 300): het venster is 480 × 270 px groot en begint op (160, 165).
    const p = naarBeeld({ x: 0, y: 0 }, TELEFOON, HD, 4, { x: 400, y: 300 })
    expect(p.x).toBeCloseTo(160, 6)
    expect(p.y).toBeCloseTo(165, 6)
  })

  it('is de omkering van naarScherm', () => {
    for (const zoom of [1, 3, 8]) {
      const midden = { x: 700, y: 400 }
      const beeldpunt = { x: 712, y: 388 }
      const scherm = naarScherm(beeldpunt, TELEFOON, HD, zoom, midden)
      const terug = naarBeeld(scherm, TELEFOON, HD, zoom, midden)
      expect(terug.x).toBeCloseTo(beeldpunt.x, 6)
      expect(terug.y).toBeCloseTo(beeldpunt.y, 6)
    }
  })

  it('blijft binnen het beeld, ook bij een tik net buiten het vak', () => {
    const p = naarBeeld({ x: -20, y: 500 }, TELEFOON, HD)
    expect(p.x).toBe(0)
    expect(p.y).toBe(1080)
  })

  it('geeft geen NaN bij een vak van nul', () => {
    expect(naarBeeld({ x: 5, y: 5 }, { breedte: 0, hoogte: 0 }, HD)).toEqual({ x: 0, y: 0 })
  })
})

describe('vensterStijl', () => {
  it('staat op het begin bij een venster linksboven', () => {
    const s = vensterStijl(HD, 4, { x: 0, y: 0 })
    expect(s.backgroundSize).toBe('400% 400%')
    expect(s.backgroundPosition).toBe('0% 0%')
  })

  it('staat op het einde bij een venster rechtsonder', () => {
    const s = vensterStijl(HD, 4, { x: 1920, y: 1080 })
    expect(s.backgroundPosition).toBe('100% 100%')
  })

  it('deelt niet door nul bij zoom 1', () => {
    expect(vensterStijl(HD, 1, { x: 960, y: 540 }).backgroundPosition).toBe('0% 0%')
  })
})

describe('nauwkeurigheidM', () => {
  it('vertaalt schermpixels naar meters op het veld', () => {
    // 5,486 beeldpixels per schermpixel × 8 px duim × 0,01 m per beeldpixel ≈ 0,44 m.
    expect(nauwkeurigheidM(HD, TELEFOON, 1, 0.01)).toBeCloseTo(0.439, 3)
    // Zes keer ingezoomd is diezelfde duim nog 7 cm waard.
    expect(nauwkeurigheidM(HD, TELEFOON, 6, 0.01)).toBeCloseTo(0.073, 3)
  })

  it('zwijgt als de meters per pixel onbekend zijn', () => {
    // Zonder kalibratie is er geen omrekening naar meters — dan liever niets beweren.
    expect(nauwkeurigheidM(HD, TELEFOON, 1, null)).toBeNull()
    expect(nauwkeurigheidM(HD, TELEFOON, 1, 0)).toBeNull()
  })
})

describe('richtwinst', () => {
  // De fijnregeling: kruipen met je duim moet het dradenkruis trager laten meegaan, anders
  // blijft één schermpixel trilling vijf beeldpixels fout — precies wat we wilden wegwerken.
  it('gaat traag bij kleine stapjes', () => {
    expect(richtwinst(0)).toBeCloseTo(1 / 3, 6)
    expect(richtwinst(1)).toBeCloseTo(1 / 3, 6)
  })

  it('volgt één op één bij een grote veeg', () => {
    // Naar de overkant van het beeld reizen mag niet drie keer zo lang duren.
    expect(richtwinst(20)).toBe(1)
    expect(richtwinst(14)).toBe(1)
  })

  it('glijdt daartussen over in plaats van te springen', () => {
    const w = richtwinst(8)
    expect(w).toBeGreaterThan(1 / 3)
    expect(w).toBeLessThan(1)
    // Monotoon: sneller bewegen mag nooit trager reageren.
    expect(richtwinst(4)).toBeLessThan(richtwinst(10))
  })

  it('kijkt naar de afstand, niet naar de richting', () => {
    expect(richtwinst(-9)).toBeCloseTo(richtwinst(9), 6)
  })
})
