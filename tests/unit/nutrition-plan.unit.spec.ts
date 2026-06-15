import { describe, it, expect } from 'vitest'

import { ACTIVITY_FACTOR, bmrMifflin, buildNutritionPlan, sanitizeNutritionProfile } from '@/lib/nutrition-plan'

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

  it('recompositie combineert vetverlies + spier: licht tekort, hoogste eiwit', () => {
    const maint = buildNutritionPlan({ ...base, goal: 'onderhoud' })
    const cut = buildNutritionPlan({ ...base, goal: 'afvallen' })
    const recomp = buildNutritionPlan({ ...base, goal: 'recompositie' })
    // licht tekort: tussen afvallen en onderhoud in
    expect(recomp.calories).toBeLessThan(maint.calories)
    expect(recomp.calories).toBeGreaterThan(cut.calories)
    // eiwit het hoogst van alle doelen (≈2,3 g/kg)
    expect(recomp.protein).toBe(Math.round(80 * 2.3))
    expect(recomp.protein).toBeGreaterThan(cut.protein)
    expect(recomp.goalLabel.toLowerCase()).toContain('recompositie')
    // licht tekort → langzaam gewichtsverlies
    expect(recomp.weeklyChangeKg).toBeLessThan(0)
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

  it('geeft geavanceerde, op maat gemaakte velden', () => {
    const cut = buildNutritionPlan({ ...base, goal: 'afvallen' })
    // BMI 80 / 1.8^2 ≈ 24.7
    expect(cut.bmi).toBeCloseTo(24.7, 1)
    expect(cut.bmiText).toBe('gezond gewicht')
    expect(cut.proteinPerMeal).toBe(Math.round(80 * 0.4)) // 32 g
    // afvallen → negatieve weekverandering
    expect(cut.weeklyChangeKg).toBeLessThan(0)
    // koolhydraatperiodisering: trainingsdag meer dan rustdag
    expect(cut.trainingDayCarbs).toBeGreaterThan(cut.restDayCarbs)
    expect(cut.trainingDayCalories).toBeGreaterThan(cut.restDayCalories)
  })

  it('voorbeelddag schaalt mee met de calorieën', () => {
    const small = buildNutritionPlan({ ...base, weightKg: 55, goal: 'afvallen' })
    const big = buildNutritionPlan({ ...base, weightKg: 100, goal: 'spiermassa' })
    expect(small.example.length).toBe(4)
    const oats = (p: ReturnType<typeof buildNutritionPlan>) => Number(p.example[0].items[0].amount.replace(/\D/g, ''))
    expect(oats(big)).toBeGreaterThan(oats(small))
  })

  it('tempo stuurt de grootte van het tekort/overschot', () => {
    const calm = buildNutritionPlan({ ...base, goal: 'afvallen', pace: 'rustig' }).calories
    const mid = buildNutritionPlan({ ...base, goal: 'afvallen', pace: 'gemiddeld' }).calories
    const fast = buildNutritionPlan({ ...base, goal: 'afvallen', pace: 'snel' }).calories
    expect(calm).toBeGreaterThan(mid)
    expect(mid).toBeGreaterThan(fast)
    // standaard-tempo 'gemiddeld' = de klassieke 0,8-factor op de TDEE
    const midPlan = buildNutritionPlan({ ...base, goal: 'afvallen', pace: 'gemiddeld' })
    expect(midPlan.calories).toBe(Math.round((midPlan.tdee * 0.8) / 10) * 10)
  })

  it('macro-stijl verschuift eiwit/koolhydraten/vet', () => {
    const balanced = buildNutritionPlan({ ...base, goal: 'onderhoud', macroStyle: 'gebalanceerd' })
    const protein = buildNutritionPlan({ ...base, goal: 'onderhoud', macroStyle: 'eiwitrijk' })
    const lowCarb = buildNutritionPlan({ ...base, goal: 'onderhoud', macroStyle: 'koolhydraatarm' })
    const endurance = buildNutritionPlan({ ...base, goal: 'onderhoud', macroStyle: 'duursport' })
    expect(protein.protein).toBeGreaterThan(balanced.protein)
    expect(lowCarb.carbs).toBeLessThan(balanced.carbs)
    expect(endurance.carbs).toBeGreaterThan(balanced.carbs)
    // gebalanceerd blijft de standaard (eiwit/vet per kg uit het doel)
    expect(balanced.protein).toBe(Math.round(80 * 1.8))
  })

  it('dieet vervangt de juiste voorbeeldvoeding', () => {
    const omni = buildNutritionPlan({ ...base, goal: 'onderhoud', diet: 'alles' })
    const vegan = buildNutritionPlan({ ...base, goal: 'onderhoud', diet: 'veganistisch' })
    const omniFoods = omni.example.flatMap((m) => m.items.map((i) => i.food)).join(' ')
    const veganFoods = vegan.example.flatMap((m) => m.items.map((i) => i.food)).join(' ')
    expect(omniFoods).toContain('kwark')
    expect(veganFoods).not.toContain('kwark')
    expect(veganFoods.toLowerCase()).toContain('tofu')
  })

  it('streefgewicht geeft een tijdlijn in de juiste richting', () => {
    const cut = buildNutritionPlan({ ...base, goal: 'afvallen', targetWeightKg: 74 })
    expect(cut.target).not.toBeNull()
    expect(cut.target!.direction).toBe('down')
    expect(cut.target!.deltaKg).toBeCloseTo(-6, 5)
    expect(cut.target!.weeks).toBeGreaterThan(0)
    // geen of een te klein verschil → geen tijdlijn
    expect(buildNutritionPlan({ ...base, goal: 'onderhoud' }).target).toBeNull()
    expect(buildNutritionPlan({ ...base, goal: 'afvallen', targetWeightKg: 80 }).target).toBeNull()
    // verkeerde richting (afvallen maar zwaarder willen worden) → onbereikbaar
    const wrong = buildNutritionPlan({ ...base, goal: 'afvallen', targetWeightKg: 90 })
    expect(wrong.target!.weeks).toBeNull()
  })
})

describe('sanitizeNutritionProfile', () => {
  it('geen object → null', () => {
    expect(sanitizeNutritionProfile(null)).toBeNull()
    expect(sanitizeNutritionProfile('x')).toBeNull()
    expect(sanitizeNutritionProfile(42)).toBeNull()
  })

  it('bewaart geldige waarden en valt terug op defaults bij onzin', () => {
    const p = sanitizeNutritionProfile({
      sex: 'v', age: '28', heightCm: '170', weightKg: '64', activity: 'hoog',
      sessionsPerWeek: '5', goal: 'afvallen', pace: 'snel', macroStyle: 'eiwitrijk',
      diet: 'veganistisch', targetWeightKg: '60',
    })!
    expect(p.sex).toBe('v')
    expect(p.age).toBe('28')
    expect(p.goal).toBe('afvallen')
    expect(p.pace).toBe('snel')
    expect(p.diet).toBe('veganistisch')

    const bad = sanitizeNutritionProfile({ sex: 'x', age: 'abc', activity: 'turbo', goal: 42, diet: null })!
    expect(bad.sex).toBe('m')
    expect(bad.age).toBe('')
    expect(bad.activity).toBe('matig')
    expect(bad.goal).toBe('onderhoud')
    expect(bad.diet).toBe('alles')
  })

  it('saneert numerieke waarden naar een korte string', () => {
    const p = sanitizeNutritionProfile({ age: 25.7, weightKg: -5, heightCm: 99999 })!
    expect(p.age).toBe('26')
    expect(p.weightKg).toBe('') // negatief → leeg
    expect(p.heightCm.length).toBeLessThanOrEqual(3)
  })
})
