import { describe, it, expect } from 'vitest'

import {
  DEFAULT_LOGO_FIT,
  hasLogoAdjustment,
  logoFitStyle,
  normalizeLogoFit,
} from '@/lib/logo-fit'

describe('normalizeLogoFit', () => {
  it('valt terug op de standaard bij ontbrekende waarden', () => {
    expect(normalizeLogoFit(null)).toEqual(DEFAULT_LOGO_FIT)
    expect(normalizeLogoFit({})).toEqual({ zoom: 1, offsetX: 0, offsetY: 0 })
  })

  it('klemt de zoom binnen [1, 3]', () => {
    expect(normalizeLogoFit({ zoom: 0.2 }).zoom).toBe(1)
    expect(normalizeLogoFit({ zoom: 5 }).zoom).toBe(3)
    expect(normalizeLogoFit({ zoom: 1.8 }).zoom).toBe(1.8)
  })

  it('klemt de verschuiving binnen ±50', () => {
    expect(normalizeLogoFit({ offsetX: -80, offsetY: 120 })).toMatchObject({ offsetX: -50, offsetY: 50 })
  })
})

describe('hasLogoAdjustment', () => {
  it('false voor standaard of leeg', () => {
    expect(hasLogoAdjustment(null)).toBe(false)
    expect(hasLogoAdjustment(DEFAULT_LOGO_FIT)).toBe(false)
  })

  it('true zodra zoom of positie afwijkt', () => {
    expect(hasLogoAdjustment({ zoom: 1.5, offsetX: 0, offsetY: 0 })).toBe(true)
    expect(hasLogoAdjustment({ zoom: 1, offsetX: 10, offsetY: 0 })).toBe(true)
  })
})

describe('logoFitStyle', () => {
  it('geen transform wanneer er niets is aangepast', () => {
    expect(logoFitStyle(null)).toBeUndefined()
    expect(logoFitStyle(DEFAULT_LOGO_FIT)).toBeUndefined()
  })

  it('bouwt een translate+scale transform', () => {
    expect(logoFitStyle({ zoom: 2, offsetX: 10, offsetY: -5 })).toEqual({
      transform: 'translate(10%, -5%) scale(2)',
      transformOrigin: 'center',
    })
  })
})
