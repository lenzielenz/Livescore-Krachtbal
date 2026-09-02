import { describe, it, expect } from 'vitest'

import { ANKER_MAX_M, leesPunten, MAX_PUNTEN } from '@/lib/kalibratie-lezen'

// De poort waar de kalibratiepunten binnenkomen. Dit is de enige plek die tegenhoudt dat er onzin
// de kalibratie in glipt — en een kalibratie die pas een halfuur later blijkt te rammelen, is er
// een die je twee keer moet zetten.

const kruising = (label: string, x = 10, y = 20) => ({ label, x, y })
const anker = (label: string, xm: number, ym: number) => ({ label, x: 30, y: 40, veldM: [xm, ym] })

const punten = (uit: ReturnType<typeof leesPunten>) => ('punten' in uit ? uit.punten : null)
const fout = (uit: ReturnType<typeof leesPunten>) => ('fout' in uit ? uit.fout : null)

describe('lijnkruisingen', () => {
  it('neemt een gekend label aan en rondt de pixels af', () => {
    const uit = leesPunten([kruising('doellijn_thuis_links', 10.4, 20.6)], 'beeld 1')
    expect(punten(uit)).toEqual([{ label: 'doellijn_thuis_links', x: 10, y: 21 }])
  })

  it('weigert een onbekend label', () => {
    expect(fout(leesPunten([kruising('kantine_hoek')], 'beeld 1'))).toMatch(/Onbekend punt/)
  })

  it('weigert een absurd lange lijst', () => {
    const veel = Array.from({ length: MAX_PUNTEN + 1 }, (_, i) => anker(`anker ${i}`, 1, 1))
    expect(fout(leesPunten(veel, 'beeld 1'))).toMatch(new RegExp(String(MAX_PUNTEN)))
  })
})

describe('ankerpunten', () => {
  it('neemt een vrij punt aan met zijn veldcoördinaten', () => {
    const uit = leesPunten([anker('hoek omheining', -2.345, -1.5)], 'beeld 1')
    expect(punten(uit)).toEqual([{ label: 'hoek omheining', x: 30, y: 40, veldM: [-2.35, -1.5] }])
  })

  it('rondt de coördinaten af op centimeters', () => {
    // Meer cijfers suggereren een nauwkeurigheid die een luchtfoto niet heeft.
    const uit = leesPunten([anker('paal', 16.00449, 3.9951)], 'beeld 1')
    expect(punten(uit)![0].veldM).toEqual([16, 4])
  })

  it('weigert coördinaten die geen getal zijn', () => {
    const uit = leesPunten([{ label: 'x', x: 1, y: 2, veldM: ['a', 3] }], 'beeld 1')
    expect(fout(uit)).toMatch(/geen geldige veldcoördinaten/)
  })

  it('weigert een punt in de volgende straat', () => {
    // Ruim, maar niet grenzeloos: een ankerpunt hoort bij dít terrein.
    expect(fout(leesPunten([anker('ver weg', ANKER_MAX_M + 1, 0)], 'beeld 1'))).toMatch(/200 m/)
  })

  it('laat een ankerpunt naast lijnkruisingen staan', () => {
    const uit = leesPunten(
      [kruising('doellijn_thuis_links'), anker('hoek kantine', -3, 40)],
      'beeld 1',
    )
    expect(punten(uit)).toHaveLength(2)
    expect(punten(uit)![1].veldM).toEqual([-3, 40])
  })
})

describe('wat er sowieso niet door mag', () => {
  it('een leeg of ontbrekend lijstje', () => {
    expect(fout(leesPunten(null, 'beeld 1'))).toMatch(/ontbreekt/)
    expect(fout(leesPunten([], 'beeld 1'))).toMatch(/geen punten/)
  })

  it('hetzelfde punt twee keer', () => {
    const uit = leesPunten([kruising('doellijn_thuis_links'), kruising('doellijn_thuis_links')], 'beeld 1')
    expect(fout(uit)).toMatch(/twee keer/)
  })

  it('een punt zonder naam', () => {
    expect(fout(leesPunten([{ label: '  ', x: 1, y: 2, veldM: [0, 0] }], 'beeld 1'))).toMatch(/zonder naam/)
  })

  it('beeldcoördinaten die niet kunnen', () => {
    expect(fout(leesPunten([{ ...anker('a', 0, 0), x: -5 }], 'beeld 1'))).toMatch(/beeldcoördinaten/)
    expect(fout(leesPunten([{ ...anker('a', 0, 0), y: Number.NaN }], 'beeld 1'))).toMatch(/beeldcoördinaten/)
  })
})
