import { describe, it, expect } from 'vitest'

import { FOOD_DB, searchLocalFoods } from '@/lib/food-database'

describe('FOOD_DB', () => {
  it('bevat een ruime, geldige set', () => {
    expect(FOOD_DB.length).toBeGreaterThan(120)
    for (const f of FOOD_DB) {
      expect(f.name).toBeTruthy()
      expect(f.kcal).toBeGreaterThanOrEqual(0)
      expect(f.serving).toBeGreaterThan(0)
    }
  })
})

describe('searchLocalFoods', () => {
  it('< 2 tekens → leeg', () => expect(searchLocalFoods('a')).toEqual([]))
  it('vindt op naam', () => {
    const r = searchLocalFoods('kip')
    expect(r.length).toBeGreaterThan(0)
    expect(r.some((f) => f.name.toLowerCase().includes('kip'))).toBe(true)
  })
  it('namen die met de term beginnen staan bovenaan', () => {
    const r = searchLocalFoods('rijst')
    expect(r[0].name.toLowerCase().startsWith('rijst')).toBe(true)
  })
  it('vindt via synoniem (alias)', () => {
    const r = searchLocalFoods('patat')
    expect(r.some((f) => /friet|aardappel/i.test(f.name))).toBe(true)
  })
  it('respecteert de limiet', () => {
    expect(searchLocalFoods('e', 5).length).toBeLessThanOrEqual(5)
  })
})
