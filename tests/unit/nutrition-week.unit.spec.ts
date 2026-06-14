import { describe, it, expect } from 'vitest'

import { buildShoppingList, buildWeekPlan, spreadTrainingDays, WEEKDAYS } from '@/lib/nutrition-week'

describe('buildWeekPlan', () => {
  it('geeft 7 dagen met telkens 4 maaltijden', () => {
    const week = buildWeekPlan(2200, 'alles')
    expect(week.length).toBe(7)
    expect(week.map((d) => d.day)).toEqual([...WEEKDAYS])
    for (const d of week) {
      expect(d.meals.map((m) => m.name)).toEqual(['Ontbijt', 'Lunch', 'Avondeten', 'Tussendoor'])
      for (const m of d.meals) expect(m.items.length).toBeGreaterThan(0)
    }
  })

  it('varieert: niet elke dag identiek ontbijt', () => {
    const week = buildWeekPlan(2200, 'alles')
    const breakfasts = new Set(week.map((d) => d.meals[0].items.map((i) => i.food).join(',')))
    expect(breakfasts.size).toBeGreaterThan(1)
  })

  it('schaalt mee met de calorieën', () => {
    const grams = (cal: number) => Number(buildWeekPlan(cal, 'alles')[0].meals[0].items[0].amount.replace(/\D/g, ''))
    expect(grams(3000)).toBeGreaterThan(grams(1600))
  })

  it('past het dieet toe (veganistisch → geen kwark/feta, wel plantaardig)', () => {
    const vegan = buildWeekPlan(2200, 'veganistisch')
    const foods = vegan.flatMap((d) => d.meals.flatMap((m) => m.items.map((i) => i.food))).join(' ').toLowerCase()
    expect(foods).not.toContain('kwark')
    expect(foods).not.toContain('feta')
    expect(foods).toContain('soja')
  })
})

describe('buildShoppingList', () => {
  it('groepeert per categorie en telt op over de week', () => {
    const list = buildShoppingList(2200, 'alles')
    expect(list.length).toBeGreaterThan(0)
    // categorieën zijn niet leeg en bevatten unieke items
    for (const g of list) {
      expect(g.items.length).toBeGreaterThan(0)
      const foods = g.items.map((i) => i.food)
      expect(new Set(foods).size).toBe(foods.length)
    }
    // er is een eiwit- en een koolhydraten-categorie
    const cats = list.map((g) => g.cat)
    expect(cats).toContain('Eiwit')
    expect(cats).toContain('Koolhydraten')
  })

  it('telt herhaalde voedingsmiddelen samen (week-totaal > dagportie)', () => {
    // olijfolie komt elke dag bij avondeten terug → weektotaal moet flink hoger zijn dan één portie
    const list = buildShoppingList(2200, 'alles')
    const fats = list.find((g) => g.cat === 'Vetten & noten')!
    const olie = fats.items.find((i) => i.food === 'olijfolie')
    expect(olie).toBeDefined()
    const ml = Number(olie!.amount.replace(/\D/g, ''))
    expect(ml).toBeGreaterThanOrEqual(50) // 7× ~10 ml, afgerond per 50
  })

  it('respecteert het dieet in de boodschappenlijst', () => {
    const vegan = buildShoppingList(2200, 'veganistisch')
    const foods = vegan.flatMap((g) => g.items.map((i) => i.food)).join(' ').toLowerCase()
    expect(foods).not.toContain('feta')
    expect(foods).toContain('soja')
  })
})

describe('spreadTrainingDays', () => {
  it('spreidt het juiste aantal trainingen over de week', () => {
    expect(spreadTrainingDays(0).filter(Boolean).length).toBe(0)
    expect(spreadTrainingDays(3).filter(Boolean).length).toBe(3)
    expect(spreadTrainingDays(7).every(Boolean)).toBe(true)
    expect(spreadTrainingDays(10).filter(Boolean).length).toBe(7) // geclampt
  })
})

describe('weekplan met carb-cycling', () => {
  it('trainingsdagen krijgen meer calorieën dan rustdagen', () => {
    const week = buildWeekPlan(2400, 'alles', {
      trainingDays: [true, false, true, false, true, false, false],
      trainingCalories: 2700,
      restCalories: 2100,
    })
    const train = week.find((d) => d.kind === 'train')!
    const rest = week.find((d) => d.kind === 'rest')!
    expect(train.calories).toBe(2700)
    expect(rest.calories).toBe(2100)
    expect(train.calories).toBeGreaterThan(rest.calories)
  })

  it('zonder trainingsdagen krijgt elke dag "plain" en het basis-caloriedoel', () => {
    const week = buildWeekPlan(2200, 'alles')
    expect(week.every((d) => d.kind === 'plain')).toBe(true)
    expect(week.every((d) => d.calories === 2200)).toBe(true)
  })

  it('shift roteert de varianten (andere variatie)', () => {
    const a = buildWeekPlan(2200, 'alles', { shift: 0 })[0].meals[0].items.map((i) => i.food).join(',')
    const b = buildWeekPlan(2200, 'alles', { shift: 1 })[0].meals[0].items.map((i) => i.food).join(',')
    expect(a).not.toBe(b)
  })
})
