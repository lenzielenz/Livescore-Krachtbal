import { describe, it, expect } from 'vitest'

import { isAnker, puntArgumenten, veiligAnkerNaam } from '@/lib/kalibratie-argv'

// De omzetting van kalibratiepunten naar argumenten voor cv/calibrate.py.

describe('lijnkruising of ankerpunt', () => {
  it('herkent een lijnkruising aan het ontbreken van veldcoördinaten', () => {
    expect(isAnker({ label: 'doellijn_thuis_links', x: 1, y: 2 })).toBe(false)
    expect(isAnker({ label: 'x', x: 1, y: 2, veldM: null })).toBe(false)
  })

  it('herkent een ankerpunt aan zijn veldcoördinaten', () => {
    expect(isAnker({ label: 'omheining', x: 1, y: 2, veldM: [-2, -1.5] })).toBe(true)
  })

  it('vertrouwt geen halve coördinaten', () => {
    expect(isAnker({ label: 'x', x: 1, y: 2, veldM: [Number.NaN, 3] })).toBe(false)
    expect(isAnker({ label: 'x', x: 1, y: 2, veldM: [1] as unknown as [number, number] })).toBe(false)
  })
})

describe('argumenten voor calibrate.py', () => {
  it('stuurt een lijnkruising via --punt met haar label', () => {
    expect(puntArgumenten([{ label: 'doellijn_thuis_links', x: 811.6, y: 1013.2 }]))
      .toEqual(['--punt', '812,1013=doellijn_thuis_links'])
  })

  it('stuurt een ankerpunt via --anker mét zijn veldcoördinaten', () => {
    expect(puntArgumenten([{ label: 'hoek omheining', x: 410.4, y: 980, veldM: [-2, -1.5] }]))
      .toEqual(['--anker', '410,980=-2,-1.5:hoek omheining'])
  })

  it('mengt beide soorten in één beeld', () => {
    const uit = puntArgumenten([
      { label: 'middellijn_links', x: 10, y: 20 },
      { label: 'paal', x: 30, y: 40, veldM: [16, -1] },
    ])
    expect(uit).toEqual(['--punt', '10,20=middellijn_links', '--anker', '30,40=16,-1:paal'])
  })

  it('maakt een naam veilig die de vlag zou breken', () => {
    // Een dubbele punt of komma in de naam zou het argument in stukken hakken.
    expect(veiligAnkerNaam('hoek: kantine, links')).toBe('hoek kantine links')
    expect(veiligAnkerNaam('   ')).toBe('anker')
    expect(veiligAnkerNaam('x'.repeat(80)).length).toBe(40)
  })

  it('gebruikt die veilige naam ook echt in het argument', () => {
    const [vlag, waarde] = puntArgumenten([{ label: 'a:b,c', x: 1, y: 2, veldM: [0, 0] }])
    expect(vlag).toBe('--anker')
    expect(waarde).toBe('1,2=0,0:a b c')
  })
})
