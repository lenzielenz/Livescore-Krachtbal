import { describe, it, expect } from 'vitest'

import { mapProduct, scalePer100 } from '@/lib/openfoodfacts'

describe('scalePer100', () => {
  it('schaalt naar gram', () => {
    expect(scalePer100({ kcal: 200, p: 10, c: 30, f: 5 }, 50)).toEqual({ kcal: 100, p: 5, c: 15, f: 3 })
  })
  it('100 g = ongewijzigd', () => {
    expect(scalePer100({ kcal: 200, p: 10, c: 30, f: 5 }, 100)).toEqual({ kcal: 200, p: 10, c: 30, f: 5 })
  })
})

describe('mapProduct', () => {
  it('mapt een normaal product', () => {
    const f = mapProduct({
      code: '123',
      product_name: 'Test Brood',
      brands: 'MerkA, MerkB',
      serving_quantity: 35,
      nutriments: { 'energy-kcal_100g': 250, proteins_100g: 9, carbohydrates_100g: 45, fat_100g: 3 },
    })
    expect(f).toMatchObject({ id: '123', name: 'Test Brood', brand: 'MerkA', servingGrams: 35 })
    expect(f?.per100).toEqual({ kcal: 250, p: 9, c: 45, f: 3 })
  })
  it('rekent kcal uit kJ als kcal ontbreekt', () => {
    const f = mapProduct({ code: '1', product_name: 'X', nutriments: { energy_100g: 418.4 } })
    expect(f?.per100.kcal).toBe(100)
  })
  it('verkiest de Nederlandse naam', () => {
    const f = mapProduct({ code: '1', product_name: 'Apple', product_name_nl: 'Appel', nutriments: { 'energy-kcal_100g': 52 } })
    expect(f?.name).toBe('Appel')
  })
  it('null zonder naam of zonder energie', () => {
    expect(mapProduct({ code: '1', nutriments: { 'energy-kcal_100g': 100 } })).toBeNull()
    expect(mapProduct({ code: '1', product_name: 'X', nutriments: {} })).toBeNull()
    expect(mapProduct(null)).toBeNull()
  })
})
