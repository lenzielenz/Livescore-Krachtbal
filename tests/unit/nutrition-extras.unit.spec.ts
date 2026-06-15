import { describe, it, expect } from 'vitest'

import {
  hydrationSchedule,
  matchDayFuel,
  micronutrientFocus,
  proteinTiming,
  supplements,
} from '@/lib/nutrition-extras'

describe('proteinTiming', () => {
  it('verdeelt het eiwit over 4 momenten, samen ≈ totaal', () => {
    const slots = proteinTiming(160)
    expect(slots.length).toBe(4)
    const sum = slots.reduce((a, s) => a + s.grams, 0)
    expect(Math.abs(sum - 160)).toBeLessThanOrEqual(4)
    expect(slots.every((s) => s.grams > 0)).toBe(true)
  })
})

describe('hydrationSchedule', () => {
  it('spreidt het vocht en voegt een trainingsmoment toe bij sporten', () => {
    const withTraining = hydrationSchedule(3000, 4)
    const noTraining = hydrationSchedule(3000, 0)
    expect(withTraining.some((s) => /training/i.test(s.moment))).toBe(true)
    expect(noTraining.some((s) => /training/i.test(s.moment))).toBe(false)
    // basisslots vullen samen ongeveer het totaal
    const base = noTraining.reduce((a, s) => a + s.ml, 0)
    expect(Math.abs(base - 3000)).toBeLessThanOrEqual(250)
  })
})

describe('matchDayFuel', () => {
  it('geeft een tijdlijn met porties die met het gewicht meeschalen', () => {
    const light = matchDayFuel(60)
    const heavy = matchDayFuel(100)
    expect(light.length).toBeGreaterThanOrEqual(5)
    const kh = (steps: ReturnType<typeof matchDayFuel>) => Number(steps[0].what.match(/(\d+)\s*g KH/)![1])
    expect(kh(heavy)).toBeGreaterThan(kh(light))
  })
})

describe('supplements', () => {
  it('bevat altijd creatine en sluit af met een waarschuwing', () => {
    const list = supplements('onderhoud', 'alles', 2)
    expect(list.some((s) => /creatine/i.test(s.name))).toBe(true)
    expect(list[list.length - 1].name).toBe('Let op')
  })

  it('veganist krijgt B12 als sterk bewezen advies', () => {
    const list = supplements('spiermassa', 'veganistisch', 4)
    const b12 = list.find((s) => /b12/i.test(s.name))
    expect(b12).toBeDefined()
    expect(b12!.tag).toBe('Sterk bewezen')
  })

  it('veel trainen voegt cafeïne/sportdrank toe', () => {
    const many = supplements('onderhoud', 'alles', 5)
    expect(many.some((s) => /cafe/i.test(s.name))).toBe(true)
  })

  it('recompositie krijgt eiwitpoeder-advies', () => {
    const list = supplements('recompositie', 'alles', 3)
    expect(list.some((s) => /eiwitpoeder/i.test(s.name))).toBe(true)
  })
})

describe('micronutrientFocus', () => {
  it('veganistisch legt de nadruk op B12', () => {
    const v = micronutrientFocus('veganistisch')
    expect(v.some((m) => /b12/i.test(m.nutrient))).toBe(true)
  })
  it('lactosevrij legt de nadruk op calcium', () => {
    const l = micronutrientFocus('lactosevrij')
    expect(l.some((m) => /calcium/i.test(m.nutrient))).toBe(true)
  })
})
