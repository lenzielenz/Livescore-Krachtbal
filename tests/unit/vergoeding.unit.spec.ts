import { describe, it, expect } from 'vitest'

import {
  berekenForfait,
  berekenKwitantie,
  formatEuro,
  formatKmTarief,
  geldigKmTarief,
  KM_TARIEF_STANDAARD,
  VERGOEDING_PER_WEDSTRIJD,
} from '@/lib/vergoeding'

describe('berekenKwitantie (€13/wedstrijd + km × km-tarief)', () => {
  it('telt wedstrijden × €13 en km × het standaardtarief (€0,4452)', () => {
    const r = berekenKwitantie(3, 100)
    expect(KM_TARIEF_STANDAARD).toBe(0.4452)
    expect(r.wedstrijdvergoeding).toBe(39)
    expect(r.kmVergoeding).toBe(44.52)
    expect(r.totaal).toBe(83.52)
    expect(r.perKm).toBe(0.4452)
  })
  it('0 wedstrijden, 0 km → 0', () => {
    expect(berekenKwitantie(0, 0).totaal).toBe(0)
  })
  it('rondt de km-vergoeding af op centen', () => {
    expect(berekenKwitantie(0, 1).kmVergoeding).toBe(0.45)
  })
  it('rekent met het tarief dat de federatie instelde', () => {
    expect(berekenKwitantie(1, 100, 0.5).kmVergoeding).toBe(50)
    expect(berekenKwitantie(1, 100, 0.5).totaal).toBe(63)
  })
})

describe('berekenForfait: hetzelfde km-tarief', () => {
  it('€13 + km × km-tarief', () => {
    const r = berekenForfait(1, 100)
    expect(r.wedstrijdvergoeding).toBe(VERGOEDING_PER_WEDSTRIJD)
    expect(r.kmVergoeding).toBe(44.52)
    expect(berekenForfait(1, 100, 0.4).kmVergoeding).toBe(40)
  })
})

describe('km-tarief', () => {
  it('een onzinnige instelling valt terug op het standaardtarief', () => {
    expect(geldigKmTarief(null)).toBe(0.4452)
    expect(geldigKmTarief(-1)).toBe(0.4452)
    expect(geldigKmTarief('0.47')).toBe(0.47)
    expect(geldigKmTarief(12)).toBe(0.4452)
  })
  it('toont vier decimalen, met komma', () => {
    expect(formatKmTarief(0.4452)).toBe('€0,4452')
    expect(formatKmTarief(0.5)).toBe('€0,5000')
  })
})

describe('formatEuro', () => {
  it('formatteert in nl-BE met euroteken', () => {
    expect(formatEuro(42.59)).toContain('42,59')
  })
})
