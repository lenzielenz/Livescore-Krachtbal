// ── Sportvoeding-plan ──────────────────────────────────────────────────────────────────────────
// Berekent een persoonlijk, sportgericht voedingsplan uit je gegevens en doel. Pure functies → los
// testbaar. Onderbouwing: BMR via Mifflin-St Jeor, TDEE via activiteitsfactor, doel-aanpassing
// (afvallen/onderhouden/spiermassa), en eiwit/vet/koolhydraten per kg lichaamsgewicht zoals
// gangbaar in de sportvoeding (eiwit 1,8–2,2 g/kg; vet 0,8–1,0 g/kg; rest koolhydraten voor energie).

export type Sex = 'm' | 'v'
export type Activity = 'laag' | 'licht' | 'matig' | 'hoog' | 'zeer-hoog'
export type Goal = 'afvallen' | 'onderhoud' | 'spiermassa'

export interface NutritionInput {
  sex: Sex
  age: number
  heightCm: number
  weightKg: number
  activity: Activity
  goal: Goal
  /** Aantal trainingen/wedstrijden per week (voor hydratatie + koolhydraat-timing). */
  sessionsPerWeek?: number
}

export interface Meal { name: string; kcal: number; pct: number; tip: string }
export interface ExampleMeal { name: string; items: { amount: string; food: string }[] }
export interface NutritionPlan {
  bmr: number
  tdee: number
  calories: number
  protein: number
  fat: number
  carbs: number
  /** Vocht per dag in ml (basis); plus losse extra-tip rond training. */
  hydrationMl: number
  goalLabel: string
  meals: Meal[]
  tips: string[]
  // ── Geavanceerd, op maat ──
  /** Eiwit per maaltijd (≈0,4 g/kg) voor optimale spieropbouw. */
  proteinPerMeal: number
  bmi: number
  bmiText: string
  /** Verwachte gewichtsverandering per week (kg, +/-) bij dit caloriedoel. */
  weeklyChangeKg: number
  /** Koolhydraatperiodisering: meer op trainingsdagen, minder op rustdagen. */
  trainingDayCalories: number
  trainingDayCarbs: number
  restDayCalories: number
  restDayCarbs: number
  /** Voorbeelddag met concrete porties, geschaald op jouw calorieën. */
  example: ExampleMeal[]
}

export const ACTIVITY_FACTOR: Record<Activity, number> = {
  laag: 1.2,
  licht: 1.375,
  matig: 1.55,
  hoog: 1.725,
  'zeer-hoog': 1.9,
}

const GOAL_FACTOR: Record<Goal, number> = { afvallen: 0.8, onderhoud: 1, spiermassa: 1.12 }
const PROTEIN_PER_KG: Record<Goal, number> = { afvallen: 2.2, onderhoud: 1.8, spiermassa: 2.0 }
const FAT_PER_KG: Record<Goal, number> = { afvallen: 0.8, onderhoud: 0.9, spiermassa: 1.0 }
const GOAL_LABEL: Record<Goal, string> = { afvallen: 'Afvallen (vetverlies)', onderhoud: 'Op gewicht blijven', spiermassa: 'Spiermassa opbouwen' }

const round = (n: number, step = 1) => Math.round(n / step) * step

/** Basaalmetabolisme (Mifflin-St Jeor), kcal/dag. */
export function bmrMifflin(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  return Math.round(base + (sex === 'm' ? 5 : -161))
}

/** Bouw het volledige sportvoedingsplan. */
export function buildNutritionPlan(input: NutritionInput): NutritionPlan {
  const kg = Math.max(25, Math.min(250, input.weightKg))
  const bmr = bmrMifflin(input.sex, kg, input.heightCm, input.age)
  const tdee = Math.round(bmr * (ACTIVITY_FACTOR[input.activity] ?? 1.55))
  const calories = round(tdee * GOAL_FACTOR[input.goal], 10)

  const protein = round(kg * PROTEIN_PER_KG[input.goal])
  const fat = round(kg * FAT_PER_KG[input.goal])
  // Koolhydraten = de resterende energie (1 g eiwit/kh = 4 kcal, 1 g vet = 9 kcal).
  const carbs = Math.max(0, round((calories - protein * 4 - fat * 9) / 4))

  const sessions = Math.max(0, Math.min(14, input.sessionsPerWeek ?? 3))
  // Basis 35 ml/kg; bij meer trainingen iets meer (zweetverlies).
  const hydrationMl = round(kg * 35 + (sessions >= 4 ? 500 : sessions >= 2 ? 300 : 0), 50)

  const meals = splitMeals(calories)
  const tips = buildTips(input.goal, sessions)

  // Geavanceerd, op maat.
  const proteinPerMeal = round(kg * 0.4)
  const m = input.heightCm / 100
  const bmi = Math.round((kg / (m * m)) * 10) / 10
  const bmiText = bmi < 18.5 ? 'ondergewicht' : bmi < 25 ? 'gezond gewicht' : bmi < 30 ? 'licht overgewicht' : 'overgewicht'
  // ~7700 kcal per kg lichaamsvet → verwachte weekverandering uit het calorieverschil.
  const weeklyChangeKg = Math.round((((calories - tdee) * 7) / 7700) * 10) / 10
  // Koolhydraatperiodisering: ±1 g/kg verschuiven tussen trainings- en rustdagen.
  const carbShift = round(kg * 1)
  const trainingDayCarbs = carbs + carbShift
  const restDayCarbs = Math.max(0, carbs - carbShift)
  const trainingDayCalories = round(calories + carbShift * 4, 10)
  const restDayCalories = round(calories - carbShift * 4, 10)
  const example = exampleDay(calories)

  return {
    bmr, tdee, calories, protein, fat, carbs, hydrationMl, goalLabel: GOAL_LABEL[input.goal], meals, tips,
    proteinPerMeal, bmi, bmiText, weeklyChangeKg,
    trainingDayCalories, trainingDayCarbs, restDayCalories, restDayCarbs, example,
  }
}

// Basis-voorbeelddag (≈2200 kcal); de porties worden geschaald naar het persoonlijke caloriedoel.
const EXAMPLE_BASE: { name: string; items: { unit: 'g' | 'ml' | 'st'; food: string; n: number }[] }[] = [
  { name: 'Ontbijt', items: [
    { unit: 'g', food: 'havermout', n: 70 },
    { unit: 'ml', food: 'melk of sojadrink', n: 250 },
    { unit: 'st', food: 'banaan', n: 1 },
    { unit: 'g', food: 'walnoten', n: 20 },
  ] },
  { name: 'Lunch', items: [
    { unit: 'g', food: 'volkorenbrood', n: 120 },
    { unit: 'g', food: 'kipfilet of tonijn', n: 100 },
    { unit: 'g', food: 'hummus of kaas', n: 30 },
    { unit: 'g', food: 'groenten / salade', n: 150 },
  ] },
  { name: 'Avondeten', items: [
    { unit: 'g', food: 'zalm of kipfilet', n: 170 },
    { unit: 'g', food: 'rijst (droog gewogen)', n: 90 },
    { unit: 'g', food: 'groenten', n: 200 },
    { unit: 'ml', food: 'olijfolie', n: 10 },
  ] },
  { name: 'Tussendoor', items: [
    { unit: 'g', food: 'magere kwark', n: 250 },
    { unit: 'g', food: 'blauwe bessen', n: 80 },
    { unit: 'g', food: 'amandelen', n: 20 },
  ] },
]

function exampleDay(calories: number): ExampleMeal[] {
  const factor = calories / 2200
  return EXAMPLE_BASE.map((meal) => ({
    name: meal.name,
    items: meal.items.map((it) => {
      if (it.unit === 'st') {
        const n = Math.max(1, Math.round(it.n * factor))
        return { amount: `${n}×`, food: it.food }
      }
      const step = it.unit === 'ml' ? 10 : 5
      const n = Math.max(step, round(it.n * factor, step))
      return { amount: `${n} ${it.unit}`, food: it.food }
    }),
  }))
}

function splitMeals(calories: number): Meal[] {
  const plan: { name: string; pct: number; tip: string }[] = [
    { name: 'Ontbijt', pct: 0.25, tip: 'Havermout, eieren of kwark + fruit — start met eiwit en trage koolhydraten.' },
    { name: 'Lunch', pct: 0.3, tip: 'Volkoren, mager vlees/vis of peulvruchten + groenten.' },
    { name: 'Avondeten', pct: 0.3, tip: 'Eiwitbron + rijst/aardappel/pasta + veel groenten.' },
    { name: 'Tussendoor', pct: 0.15, tip: 'Rond de training: banaan + noten of een eiwitshake/kwark.' },
  ]
  return plan.map((m) => ({ name: m.name, pct: Math.round(m.pct * 100), kcal: round(calories * m.pct, 10), tip: m.tip }))
}

function buildTips(goal: Goal, sessions: number): string[] {
  const t: string[] = []
  if (goal === 'afvallen') t.push('Houd je eiwit hoog (≈2,2 g/kg) om spiermassa te behouden tijdens het afvallen.', 'Vul je bord met groenten — veel volume, weinig calorieën, lang verzadigd.')
  else if (goal === 'spiermassa') t.push('Eet net boven je verbruik en spreid eiwit over 4 momenten (≈0,4 g/kg per maaltijd).', 'Plan je grootste koolhydraat-portie ná de training voor herstel en groei.')
  else t.push('Tim je koolhydraten rond training en wedstrijd voor de beste prestatie.')
  if (sessions >= 1) t.push('Vóór de training: licht verteerbare koolhydraten (banaan, brood). Ná de training: eiwit + koolhydraten binnen ~1 uur.')
  t.push('Drink verspreid over de dag; extra 500–750 ml per uur intensieve inspanning.')
  t.push('Dit is een richtlijn, geen medisch advies — bij blessures, allergieën of een medische aandoening: raadpleeg een (sport)diëtist.')
  return t
}
