// ── Week-eetplan & boodschappenlijst ─────────────────────────────────────────────────────────────
// Bouwt een gevarieerd 7-dagen eetplan uit het caloriedoel + dieet, en leidt daar automatisch een
// geaggregeerde boodschappenlijst uit af (per categorie, opgeteld over de week). Pure functies → los
// testbaar. Geïnspireerd op de kant-en-klare weekplannen + grocery list van de grote voedingsapps.

import type { Diet, ExampleMeal } from './nutrition-plan'

export type FoodCat = 'Eiwit' | 'Koolhydraten' | 'Groenten & fruit' | 'Zuivel' | 'Vetten & noten'

interface RecipeItem { unit: 'g' | 'ml' | 'st'; food: string; n: number; cat: FoodCat; swap?: Partial<Record<Diet, string>> }
interface Recipe { items: RecipeItem[] }

// Per maaltijdmoment meerdere varianten (≈ aandeel van een dag van 2200 kcal), zodat de week varieert.
const BREAKFAST: Recipe[] = [
  { items: [
    { unit: 'g', food: 'havermout', n: 70, cat: 'Koolhydraten' },
    { unit: 'ml', food: 'magere of plantaardige melk', n: 250, cat: 'Zuivel', swap: { veganistisch: 'soja- of haverdrink', lactosevrij: 'lactosevrije melk of sojadrink' } },
    { unit: 'st', food: 'banaan', n: 1, cat: 'Groenten & fruit' },
    { unit: 'g', food: 'walnoten', n: 20, cat: 'Vetten & noten' },
  ] },
  { items: [
    { unit: 'g', food: 'volkoren muesli', n: 80, cat: 'Koolhydraten' },
    { unit: 'g', food: 'magere yoghurt', n: 200, cat: 'Zuivel', swap: { veganistisch: 'sojayoghurt', lactosevrij: 'lactosevrije yoghurt' } },
    { unit: 'st', food: 'appel', n: 1, cat: 'Groenten & fruit' },
    { unit: 'g', food: 'amandelen', n: 20, cat: 'Vetten & noten' },
  ] },
  { items: [
    { unit: 'g', food: 'volkorenbrood', n: 80, cat: 'Koolhydraten' },
    { unit: 'g', food: 'pindakaas', n: 25, cat: 'Vetten & noten' },
    { unit: 'g', food: 'magere kwark', n: 150, cat: 'Zuivel', swap: { veganistisch: 'sojayoghurt', lactosevrij: 'lactosevrije kwark' } },
    { unit: 'g', food: 'aardbeien', n: 100, cat: 'Groenten & fruit' },
  ] },
]
const LUNCH: Recipe[] = [
  { items: [
    { unit: 'g', food: 'volkorenbrood', n: 120, cat: 'Koolhydraten' },
    { unit: 'g', food: 'kipfilet of tonijn', n: 100, cat: 'Eiwit', swap: { vegetarisch: 'ei of kaas', veganistisch: 'hummus of falafel' } },
    { unit: 'g', food: 'hummus', n: 30, cat: 'Vetten & noten' },
    { unit: 'g', food: 'gemengde salade', n: 150, cat: 'Groenten & fruit' },
  ] },
  { items: [
    { unit: 'g', food: 'volkoren wrap', n: 100, cat: 'Koolhydraten' },
    { unit: 'g', food: 'kikkererwten', n: 120, cat: 'Eiwit' },
    { unit: 'g', food: 'feta', n: 40, cat: 'Zuivel', swap: { veganistisch: 'geroosterde tofu', lactosevrij: 'tofu of extra kikkererwten' } },
    { unit: 'g', food: 'rauwkost', n: 150, cat: 'Groenten & fruit' },
  ] },
  { items: [
    { unit: 'g', food: 'volkoren pasta (droog)', n: 90, cat: 'Koolhydraten' },
    { unit: 'g', food: 'tonijn of kip', n: 100, cat: 'Eiwit', swap: { vegetarisch: 'mozzarella of ei', veganistisch: 'rode linzen' } },
    { unit: 'ml', food: 'olijfolie', n: 10, cat: 'Vetten & noten' },
    { unit: 'g', food: 'cherrytomaten', n: 150, cat: 'Groenten & fruit' },
  ] },
]
const DINNER: Recipe[] = [
  { items: [
    { unit: 'g', food: 'zalm of kipfilet', n: 170, cat: 'Eiwit', swap: { vegetarisch: 'halloumi of quorn', veganistisch: 'tofu, tempeh of linzen' } },
    { unit: 'g', food: 'rijst (droog)', n: 90, cat: 'Koolhydraten' },
    { unit: 'g', food: 'wokgroenten', n: 200, cat: 'Groenten & fruit' },
    { unit: 'ml', food: 'olijfolie', n: 10, cat: 'Vetten & noten' },
  ] },
  { items: [
    { unit: 'g', food: 'mager rundvlees of kip', n: 150, cat: 'Eiwit', swap: { vegetarisch: 'quorn of kaas', veganistisch: 'tempeh of zwarte bonen' } },
    { unit: 'g', food: 'zoete aardappel', n: 250, cat: 'Koolhydraten' },
    { unit: 'g', food: 'broccoli', n: 200, cat: 'Groenten & fruit' },
    { unit: 'ml', food: 'olijfolie', n: 10, cat: 'Vetten & noten' },
  ] },
  { items: [
    { unit: 'g', food: 'witvis of kip', n: 170, cat: 'Eiwit', swap: { vegetarisch: 'eieren + kaas', veganistisch: 'kikkererwten + tofu' } },
    { unit: 'g', food: 'volkoren couscous (droog)', n: 80, cat: 'Koolhydraten' },
    { unit: 'g', food: 'courgette & paprika', n: 200, cat: 'Groenten & fruit' },
    { unit: 'ml', food: 'olijfolie', n: 10, cat: 'Vetten & noten' },
  ] },
]
const SNACK: Recipe[] = [
  { items: [
    { unit: 'g', food: 'magere kwark', n: 250, cat: 'Zuivel', swap: { veganistisch: 'sojayoghurt', lactosevrij: 'lactosevrije kwark' } },
    { unit: 'g', food: 'blauwe bessen', n: 80, cat: 'Groenten & fruit' },
    { unit: 'g', food: 'amandelen', n: 20, cat: 'Vetten & noten' },
  ] },
  { items: [
    { unit: 'g', food: 'Griekse yoghurt', n: 200, cat: 'Zuivel', swap: { veganistisch: 'sojayoghurt', lactosevrij: 'lactosevrije yoghurt' } },
    { unit: 'st', food: 'banaan', n: 1, cat: 'Groenten & fruit' },
    { unit: 'g', food: 'walnoten', n: 20, cat: 'Vetten & noten' },
  ] },
  { items: [
    { unit: 'g', food: 'gemengde noten', n: 30, cat: 'Vetten & noten' },
    { unit: 'g', food: 'magere kwark', n: 200, cat: 'Zuivel', swap: { veganistisch: 'sojayoghurt', lactosevrij: 'lactosevrije kwark' } },
    { unit: 'st', food: 'appel', n: 1, cat: 'Groenten & fruit' },
  ] },
]

export const WEEKDAYS = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'] as const

export type DayKind = 'train' | 'rest' | 'plain'
export interface WeekDay { day: string; kind: DayKind; calories: number; meals: ExampleMeal[] }
export interface ShoppingItem { food: string; amount: string }
export interface ShoppingGroup { cat: FoodCat; items: ShoppingItem[] }

export interface WeekOpts {
  /** Welke dagen (index 0=maandag … 6=zondag) trainingsdagen zijn → koolhydraatperiodisering. */
  trainingDays?: boolean[]
  /** Calorieën op een trainingsdag (bv. plan.trainingDayCalories). */
  trainingCalories?: number
  /** Calorieën op een rustdag (bv. plan.restDayCalories). */
  restCalories?: number
  /** Rotatie van de maaltijdvarianten (voor "andere variatie"). */
  shift?: number
}

/** Spreid een aantal trainingen evenwichtig over de week (index 0=maandag … 6=zondag). */
export function spreadTrainingDays(sessionsPerWeek: number): boolean[] {
  const n = Math.max(0, Math.min(7, Math.round(sessionsPerWeek)))
  const days = Array(7).fill(false) as boolean[]
  for (let i = 0; i < n; i++) days[Math.round((i * 7) / n) % 7] = true
  return days
}

const round = (n: number, step = 1) => Math.round(n / step) * step

// Een geschaald item (numeriek), met de dieet-vervanger al toegepast.
interface ScaledItem { unit: 'g' | 'ml' | 'st'; food: string; n: number; cat: FoodCat }

function scaleItem(it: RecipeItem, factor: number, diet: Diet): ScaledItem {
  const food = it.swap?.[diet] ?? it.food
  if (it.unit === 'st') return { unit: 'st', food, n: Math.max(1, Math.round(it.n * factor)), cat: it.cat }
  const step = it.unit === 'ml' ? 10 : 5
  return { unit: it.unit, food, n: Math.max(step, round(it.n * factor, step)), cat: it.cat }
}

const fmt = (it: { unit: 'g' | 'ml' | 'st'; n: number }) => (it.unit === 'st' ? `${it.n}×` : `${it.n} ${it.unit}`)

// Calorieën van dag i, rekening houdend met de eventuele trainings-/rustdag-periodisering.
function dayCalories(i: number, calories: number, opts: WeekOpts): { cal: number; kind: DayKind } {
  const base = calories > 0 ? calories : 2200
  if (opts.trainingDays && opts.trainingDays[i]) return { cal: opts.trainingCalories ?? base, kind: 'train' }
  if (opts.trainingDays && !opts.trainingDays[i]) return { cal: opts.restCalories ?? base, kind: 'rest' }
  return { cal: base, kind: 'plain' }
}

const mod = (n: number, m: number) => ((n % m) + m) % m

// De ruwe week (numeriek) — basis voor zowel het weekplan als de boodschappenlijst.
function weekRaw(calories: number, diet: Diet, opts: WeekOpts = {}): { day: string; kind: DayKind; calories: number; meals: { name: string; items: ScaledItem[] }[] }[] {
  const shift = opts.shift ?? 0
  return WEEKDAYS.map((day, i) => {
    const { cal, kind } = dayCalories(i, calories, opts)
    const factor = cal / 2200
    return {
      day,
      kind,
      calories: round(cal, 10),
      meals: [
        { name: 'Ontbijt', items: BREAKFAST[mod(i + shift, BREAKFAST.length)].items.map((it) => scaleItem(it, factor, diet)) },
        { name: 'Lunch', items: LUNCH[mod(i + 1 + shift, LUNCH.length)].items.map((it) => scaleItem(it, factor, diet)) },
        { name: 'Avondeten', items: DINNER[mod(i + 2 + shift, DINNER.length)].items.map((it) => scaleItem(it, factor, diet)) },
        { name: 'Tussendoor', items: SNACK[mod(i + shift, SNACK.length)].items.map((it) => scaleItem(it, factor, diet)) },
      ],
    }
  })
}

/** Gevarieerd 7-dagen eetplan, geschaald op het caloriedoel en aangepast aan het dieet. */
export function buildWeekPlan(calories: number, diet: Diet, opts: WeekOpts = {}): WeekDay[] {
  return weekRaw(calories, diet, opts).map((d) => ({
    day: d.day,
    kind: d.kind,
    calories: d.calories,
    meals: d.meals.map((m) => ({ name: m.name, items: m.items.map((it) => ({ amount: fmt(it), food: it.food })) })),
  }))
}

const CAT_ORDER: FoodCat[] = ['Eiwit', 'Koolhydraten', 'Groenten & fruit', 'Zuivel', 'Vetten & noten']

/** Boodschappenlijst voor de hele week: opgeteld per voedingsmiddel, gegroepeerd per categorie. */
export function buildShoppingList(calories: number, diet: Diet, opts: WeekOpts = {}): ShoppingGroup[] {
  const totals = new Map<string, ScaledItem>()
  for (const day of weekRaw(calories, diet, opts)) {
    for (const meal of day.meals) {
      for (const it of meal.items) {
        const key = `${it.cat}|${it.food}|${it.unit}`
        const cur = totals.get(key)
        if (cur) cur.n += it.n
        else totals.set(key, { ...it })
      }
    }
  }
  return CAT_ORDER.map((cat) => ({
    cat,
    items: [...totals.values()]
      .filter((it) => it.cat === cat)
      .map((it) => {
        // Nette winkelhoeveelheden: gram → per 10, ml → per 50, stuks → heel.
        const n = it.unit === 'st' ? it.n : round(it.n, it.unit === 'ml' ? 50 : 10)
        return { food: it.food, amount: fmt({ unit: it.unit, n }) }
      })
      .sort((a, b) => a.food.localeCompare(b.food, 'nl')),
  })).filter((g) => g.items.length > 0)
}
