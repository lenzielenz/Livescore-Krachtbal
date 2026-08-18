import { describe, it, expect } from 'vitest'

import { balgewichtKg, balgewichtLabel, geslachtVanReeks } from '@/lib/balgewicht'

describe('geslachtVanReeks', () => {
  it('leest het geslacht uit de senioren-reeksen', () => {
    expect(geslachtVanReeks('1NAH')).toBe('heren')
    expect(geslachtVanReeks('2NAHB')).toBe('heren')
    expect(geslachtVanReeks('LH')).toBe('heren')
    expect(geslachtVanReeks('RHC')).toBe('heren')
    expect(geslachtVanReeks('1NAD')).toBe('dames')
    expect(geslachtVanReeks('LD')).toBe('dames')
    expect(geslachtVanReeks('RDB')).toBe('dames')
  })

  it('leest het geslacht uit de jeugdreeksen', () => {
    expect(geslachtVanReeks('U18J')).toBe('heren')
    expect(geslachtVanReeks('U14JB')).toBe('heren')
    expect(geslachtVanReeks('U16M')).toBe('dames')
    expect(geslachtVanReeks('U16MA')).toBe('dames')
  })

  it('geeft null wanneer de reeks niets prijsgeeft', () => {
    expect(geslachtVanReeks('U12')).toBeNull()
    expect(geslachtVanReeks('beker')).toBeNull()
    expect(geslachtVanReeks(undefined)).toBeNull()
  })
})

describe('balgewicht (§3)', () => {
  it('heren: U12 1 kg, U14 2 kg, U16/U18 3 kg, U20/senioren 4 kg', () => {
    expect(balgewichtKg('U12', 'U12')).toBe(1)
    expect(balgewichtKg('U14', 'U14J')).toBe(2)
    expect(balgewichtKg('U16', 'U16J')).toBe(3)
    expect(balgewichtKg('U18', 'U18J')).toBe(3)
    expect(balgewichtKg('senioren', '1NAH')).toBe(4)
  })

  it('dames: U12/U14/U16 1 kg, U18/U20/senioren 2 kg', () => {
    expect(balgewichtKg('U14', 'U14M')).toBe(1)
    expect(balgewichtKg('U16', 'U16MA')).toBe(1)
    expect(balgewichtKg('U18', 'U18M')).toBe(2)
    expect(balgewichtKg('senioren', '1NAD')).toBe(2)
    expect(balgewichtKg('senioren', 'LD')).toBe(2)
  })

  it('valt zonder bruikbare reeks terug op heren (het zwaarste geval)', () => {
    expect(balgewichtKg('senioren', 'beker')).toBe(4)
    expect(balgewichtKg('U16', undefined)).toBe(3)
  })

  it('toont een leesbaar label', () => {
    expect(balgewichtLabel('senioren', '1NAH')).toBe('4 kg')
    expect(balgewichtLabel('U16', 'U16M')).toBe('1 kg')
  })
})
