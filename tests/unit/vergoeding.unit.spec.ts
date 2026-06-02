import { describe, it, expect } from 'vitest'

import {
  berekenForfait,
  berekenKwitantie,
  formatEuro,
  FORFAIT_PER_KM,
  KWITANTIE_PER_KM,
  VERGOEDING_PER_WEDSTRIJD,
} from '@/lib/vergoeding'

describe('berekenKwitantie (€13/wedstrijd + €0,4327/km)', () => {
  it('telt wedstrijden × €13 en km × tarief', () => {
    const r = berekenKwitantie(3, 100)
    expect(r.wedstrijdvergoeding).toBe(39)
    expect(r.kmVergoeding).toBe(43.27)
    expect(r.totaal).toBe(82.27)
  })
  it('0 wedstrijden, 0 km → 0', () => {
    expect(berekenKwitantie(0, 0).totaal).toBe(0)
  })
  it('rondt de km-vergoeding af op centen', () => {
    // 1 km × €0,4327 = €0,4327 → afgerond €0,43
    expect(berekenKwitantie(0, 1).kmVergoeding).toBe(0.43)
    expect(KWITANTIE_PER_KM).toBe(0.4327)
  })
})

describe('berekenForfait (€13/wedstrijd + €0,4259/km)', () => {
  it('gebruikt het — bewust andere — forfait-km-tarief', () => {
    const r = berekenForfait(1, 100)
    expect(r.wedstrijdvergoeding).toBe(VERGOEDING_PER_WEDSTRIJD)
    expect(r.kmVergoeding).toBe(42.59)
    expect(FORFAIT_PER_KM).not.toBe(KWITANTIE_PER_KM)
  })
})

describe('formatEuro', () => {
  it('formatteert in nl-BE met euroteken', () => {
    expect(formatEuro(42.59)).toContain('42,59')
  })
})
