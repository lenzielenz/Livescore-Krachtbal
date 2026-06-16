import { describe, it, expect } from 'vitest'

import { sumEntries, remaining, ringFraction, zone, statusMessage, type FoodEntry } from '@/lib/calorie-tracker'

const e = (kcal: number, p = 0, c = 0, f = 0): FoodEntry => ({ id: Math.random().toString(), name: 'x', kcal, p, c, f })

describe('sumEntries', () => {
  it('telt kcal en macro\'s op', () => {
    expect(sumEntries([e(100, 10, 5, 2), e(250, 20, 30, 8)])).toEqual({ kcal: 350, p: 30, c: 35, f: 10 })
  })
  it('leeg → nul', () => expect(sumEntries([])).toEqual({ kcal: 0, p: 0, c: 0, f: 0 }))
})

describe('remaining', () => {
  it('doel − inname (afgerond)', () => expect(remaining(2000, 1450)).toBe(550))
  it('kan negatief (erover)', () => expect(remaining(2000, 2200)).toBe(-200))
})

describe('ringFraction', () => {
  it('helft', () => expect(ringFraction(2000, 1000)).toBe(0.5))
  it('geklemd op 1', () => expect(ringFraction(2000, 3000)).toBe(1))
  it('doel 0 → 0', () => expect(ringFraction(0, 100)).toBe(0))
})

describe('zone', () => {
  it('leeg', () => expect(zone(2000, 0)).toBe('empty'))
  it('te weinig', () => expect(zone(2000, 1000)).toBe('low'))
  it('op koers', () => { expect(zone(2000, 1850)).toBe('good'); expect(zone(2000, 2000)).toBe('good') })
  it('erover', () => expect(zone(2000, 2200)).toBe('over'))
})

describe('statusMessage', () => {
  it('past zich aan per zone', () => {
    expect(statusMessage(2000, 0)).toMatch(/eerste hap/i)
    expect(statusMessage(2000, 1000)).toMatch(/Nog 1000 kcal/)
    expect(statusMessage(2000, 1950)).toMatch(/koers|balans|getimed/i)
    expect(statusMessage(2000, 2300)).toMatch(/over je doel/i)
  })
})
