import { describe, it, expect } from 'vitest'

import { ACTIVITY_FACTOR, bmrMifflin, buildNutritionPlan } from '@/lib/nutrition-plan'

describe('bmrMifflin', () => {
  it('Mifflin-St Jeor voor man en vrouw (verschil van 166)', () => {
    // man: 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
    expect(bmrMifflin('m', 80, 180, 30)).toBe(1780)
    // vrouw: zelfde basis - 161 i.p.v. +5 → 1780 - 166 = 1614
    expect(bmrMifflin('v', 80, 180, 30)).toBe(1614)
  })
})

describe('buildNutritionPlan', () => {
  const base = { sex: 'm', age: 30, heightCm: 180, weightKg: 80, activity: 'matig', sessionsPerWeek: 4 } as const

  it('TDEE = BMR × activiteitsfactor', () => {
    const p = buildNutritionPlan({ ...base, goal: 'onderhoud' })
    expect(p.tdee).toBe(Math.round(p.bmr * ACTIVITY_FACTOR.matig))
  })

  it('afvallen ligt onder, spiermassa boven onderhoud', () => {
    const maint = buildNutritionPlan({ ...base, goal: 'onderhoud' }).calories
    const cut = buildNutritionPlan({ ...base, goal: 'afvallen' }).calories
    const gain = buildNutritionPlan({ ...base, goal: 'spiermassa' }).calories
    expect(cut).toBeLessThan(maint)
    expect(gain).toBeGreaterThan(maint)
  })

  it('eiwit schaalt met lichaamsgewicht en doel (afvallen = hoogst)', () => {
    const cut = buildNutritionPlan({ ...base, goal: 'afvallen' })
    expect(cut.protein).toBe(Math.round(80 * 2.2)) // 176 g
    const gain = buildNutritionPlan({ ...base, goal: 'spiermassa' })
    expect(gain.protein).toBe(160)
  })

  it('macro-calorieën kloppen ongeveer met de doelinname', () => {
    const p = buildNutritionPlan({ ...base, goal: 'onderhoud' })
    const macroKcal = p.protein * 4 + p.fat * 9 + p.carbs * 4
    expect(Math.abs(macroKcal - p.calories)).toBeLessThanOrEqual(20)
    expect(p.carbs).toBeGreaterThan(0)
  })

  it('maaltijden tellen samen tot ~100% en geven tips', () => {
    const p = buildNutritionPlan({ ...base, goal: 'onderhoud' })
    expect(p.meals.reduce((a, m) => a + m.pct, 0)).toBe(100)
    expect(p.meals.length).toBe(4)
    expect(p.tips.length).toBeGreaterThan(2)
  })

  it('hydratatie schaalt met gewicht en trainingsvolume', () => {
    const few = buildNutritionPlan({ ...base, goal: 'onderhoud', sessionsPerWeek: 0 })
    const many = buildNutritionPlan({ ...base, goal: 'onderhoud', sessionsPerWeek: 5 })
    expect(many.hydrationMl).toBeGreaterThan(few.hydrationMl)
  })
})
