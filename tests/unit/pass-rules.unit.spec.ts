import { describe, it, expect } from 'vitest'

import { isForwardPass, passGainM, PASS_TOLERANCE_M } from '@/lib/pass-rules'

// Standaardveld: doelgebied 10 m → totale lengte 46 m. Doellijn op 10/46, middellijn op 0.5.
const M = (m: number) => m / 46

describe('isForwardPass (§6.10)', () => {
  it('zijwaarts (zelfde diepte) mag', () => {
    expect(isForwardPass({ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }, 'up')).toBe(false)
  })

  it('achterwaarts mag', () => {
    expect(isForwardPass({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.4 }, 'up')).toBe(false)
    expect(isForwardPass({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.6 }, 'down')).toBe(false)
  })

  it('voorwaarts is een fout — in beide speelrichtingen', () => {
    expect(isForwardPass({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.62 }, 'up')).toBe(true)
    expect(isForwardPass({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.38 }, 'down')).toBe(true)
  })

  it('laat een kleine speling toe (tikprecisie, niet elke centimeter is een fout)', () => {
    const netBinnen = M(PASS_TOLERANCE_M - 0.2)
    const netBuiten = M(PASS_TOLERANCE_M + 0.5)
    expect(isForwardPass({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 + netBinnen }, 'up')).toBe(false)
    expect(isForwardPass({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 + netBuiten }, 'up')).toBe(true)
  })

  it('in het eigen doelgebied mag voorwaarts wél', () => {
    expect(isForwardPass({ x: 0.5, y: 0.05 }, { x: 0.5, y: 0.3 }, 'up')).toBe(false)
    expect(isForwardPass({ x: 0.5, y: 0.95 }, { x: 0.5, y: 0.7 }, 'down')).toBe(false)
  })

  it('volgt een diepere doelgebied-instelling', () => {
    // 15 m diep → totale lengte 56 m, dus dezelfde genormaliseerde stap is méér meters.
    expect(isForwardPass({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.52 }, 'up', 15)).toBe(true)
    expect(isForwardPass({ x: 0.5, y: 0.2 }, { x: 0.5, y: 0.4 }, 'up', 15)).toBe(false) // eigen doelgebied
  })
})

describe('passGainM', () => {
  it('meet winst positief en terugloop negatief, op schaal', () => {
    expect(passGainM({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 + M(4) }, 'up')).toBeCloseTo(4, 2)
    expect(passGainM({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 - M(3) }, 'up')).toBeCloseTo(-3, 2)
    expect(passGainM({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 - M(4) }, 'down')).toBeCloseTo(4, 2)
  })
})
