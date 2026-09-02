import { describe, it, expect } from 'vitest'

import {
  afgerond,
  homografieUitVier,
  pasToe,
  veldCoordinaatVan,
  veldHoeken,
  type Punt2,
} from '@/lib/luchtfoto'

// Een luchtfoto omrekenen naar veldmeters: je duidt de vier veldhoeken aan, en elk ander punt op
// de foto krijgt daarmee zijn coördinaten — ook ver buiten het veld.

const BREED = 14
const LANG = 46

/** Een projectieve vervorming, zoals een luchtfoto die niet loodrecht genomen is. */
const scheef = (p: Punt2): Punt2 => {
  const w = 1 + 0.0016 * p.x + 0.0009 * p.y
  return { x: (120 + 9 * p.x + 1.4 * p.y) / w, y: (60 - 1.1 * p.x + 8.2 * p.y) / w }
}

const hoekparen = () =>
  veldHoeken(BREED, LANG).map((h) => ({ foto: scheef(h.veld), veld: h.veld }))

describe('vier hoeken leggen de foto vast', () => {
  it('geeft de hoeken zelf exact terug', () => {
    for (const h of veldHoeken(BREED, LANG)) {
      const uit = veldCoordinaatVan(scheef(h.veld), hoekparen())
      expect(uit).not.toBeNull()
      expect(uit!.x).toBeCloseTo(h.veld.x, 6)
      expect(uit!.y).toBeCloseTo(h.veld.y, 6)
    }
  })

  it('rekent een punt binnen het veld juist om', () => {
    const midden = { x: BREED / 2, y: LANG / 2 }
    const uit = veldCoordinaatVan(scheef(midden), hoekparen())
    expect(uit!.x).toBeCloseTo(midden.x, 6)
    expect(uit!.y).toBeCloseTo(midden.y, 6)
  })

  it('rekent ook een punt BUITEN het veld om — daar is het voor bedoeld', () => {
    // De hoek van de omheining ligt naast en achter het veld; net dát punt wil je vastleggen.
    const omheining = { x: -2.4, y: -1.8 }
    const uit = veldCoordinaatVan(scheef(omheining), hoekparen())
    expect(uit!.x).toBeCloseTo(-2.4, 5)
    expect(uit!.y).toBeCloseTo(-1.8, 5)
  })

  it('werkt ook wanneer de foto gedraaid is', () => {
    const hoek = (Math.PI / 180) * 37
    const gedraaid = (p: Punt2): Punt2 => ({
      x: 500 + 7 * (p.x * Math.cos(hoek) - p.y * Math.sin(hoek)),
      y: 400 + 7 * (p.x * Math.sin(hoek) + p.y * Math.cos(hoek)),
    })
    const paren = veldHoeken(BREED, LANG).map((h) => ({ foto: gedraaid(h.veld), veld: h.veld }))
    const uit = veldCoordinaatVan(gedraaid({ x: 3, y: 20 }), paren)
    expect(uit!.x).toBeCloseTo(3, 5)
    expect(uit!.y).toBeCloseTo(20, 5)
  })
})

describe('wat er mis kan gaan', () => {
  it('weigert drie hoeken op één rechte', () => {
    // Slordig aanduiden hoort zichtbaar te mislukken in plaats van een matrix te verzinnen.
    const paren = [
      { foto: { x: 0, y: 0 }, veld: { x: 0, y: 0 } },
      { foto: { x: 10, y: 0 }, veld: { x: BREED, y: 0 } },
      { foto: { x: 20, y: 0 }, veld: { x: BREED, y: LANG } },
      { foto: { x: 30, y: 0 }, veld: { x: 0, y: LANG } },
    ]
    expect(veldCoordinaatVan({ x: 5, y: 5 }, paren)).toBeNull()
  })

  it('weigert twee hoeken die samenvallen', () => {
    const paren = hoekparen()
    paren[1] = { ...paren[0], veld: paren[1].veld }
    expect(veldCoordinaatVan({ x: 5, y: 5 }, paren)).toBeNull()
  })

  it('weigert een onvolledige set hoeken', () => {
    expect(veldCoordinaatVan({ x: 1, y: 1 }, hoekparen().slice(0, 3))).toBeNull()
    expect(homografieUitVier([{ x: 0, y: 0 }], [{ x: 0, y: 0 }])).toBeNull()
  })

  it('geeft niets terug voor een punt op de horizon', () => {
    const h = homografieUitVier(
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
    )!
    h[2] = [1, 0, 0]
    expect(pasToe(h, { x: 0, y: 5 })).toBeNull()
  })
})

describe('afronden', () => {
  it('houdt het op centimeters', () => {
    // Meer cijfers suggereren een nauwkeurigheid die een luchtfoto niet heeft.
    expect(afgerond({ x: 1.23456, y: -7.891 })).toEqual({ x: 1.23, y: -7.89 })
  })
})

describe('de volgorde van de hoeken', () => {
  it('ligt vast, zodat scherm en wiskunde niet uiteen lopen', () => {
    expect(veldHoeken(BREED, LANG).map((h) => [h.veld.x, h.veld.y])).toEqual([
      [0, 0], [BREED, 0], [BREED, LANG], [0, LANG],
    ])
  })
})
