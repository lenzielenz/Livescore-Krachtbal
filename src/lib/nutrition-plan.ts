// ── Sportvoeding-plan ──────────────────────────────────────────────────────────────────────────
// Berekent een persoonlijk, sportgericht voedingsplan uit je gegevens en doel. Pure functies → los
// testbaar. Onderbouwing: BMR via Mifflin-St Jeor, TDEE via activiteitsfactor, doel-aanpassing
// (afvallen/onderhouden/spiermassa), en eiwit/vet/koolhydraten per kg lichaamsgewicht zoals
// gangbaar in de sportvoeding (eiwit 1,8–2,2 g/kg; vet 0,8–1,0 g/kg; rest koolhydraten voor energie).
//
// Geïnspireerd op wat de grote spelers onderscheidt: gepersonaliseerde macro-stijlen (MyFitnessPal),
// een uitgebreide intake met dieetvoorkeuren en tempo (Noom), en een doel-met-tijdlijn + kant-en-klare
// voorbeelddag per dieet (Eat This Much). Alles blijft pure rekenkunde zodat het los te testen valt.

export type Sex = 'm' | 'v'
export type Activity = 'laag' | 'licht' | 'matig' | 'hoog' | 'zeer-hoog'
export type Goal = 'afvallen' | 'onderhoud' | 'spiermassa'
/** Dieetvoorkeur — stuurt de voorbeelddag en extra aandachtspunten. */
export type Diet = 'alles' | 'vegetarisch' | 'veganistisch' | 'lactosevrij'
/** Macro-stijl — hoe de calorieën over eiwit/koolhydraten/vet verdeeld worden. */
export type MacroStyle = 'gebalanceerd' | 'eiwitrijk' | 'koolhydraatarm' | 'duursport'
/** Tempo — hoe agressief het calorietekort/-overschot is. */
export type Pace = 'rustig' | 'gemiddeld' | 'snel'

export interface NutritionInput {
  sex: Sex
  age: number
  heightCm: number
  weightKg: number
  activity: Activity
  goal: Goal
  /** Aantal trainingen/wedstrijden per week (voor hydratatie + koolhydraat-timing). */
  sessionsPerWeek?: number
  /** Dieetvoorkeur (default: alles). */
  diet?: Diet
  /** Macro-stijl (default: gebalanceerd). */
  macroStyle?: MacroStyle
  /** Tempo van afvallen/aankomen (default: gemiddeld). */
  pace?: Pace
  /** Streefgewicht in kg → levert een tijdlijn (weken tot doel). */
  targetWeightKg?: number
}

/** Bewaarbaar persoonlijk profiel: de ruwe formulierwaarden van de planner (numeriek als string). */
export interface NutritionProfile {
  sex: Sex
  age: string
  heightCm: string
  weightKg: string
  activity: Activity
  sessionsPerWeek: string
  goal: Goal
  pace: Pace
  macroStyle: MacroStyle
  diet: Diet
  targetWeightKg: string
}

const SEXES: Sex[] = ['m', 'v']
const ACTIVITIES: Activity[] = ['laag', 'licht', 'matig', 'hoog', 'zeer-hoog']
const GOALS: Goal[] = ['afvallen', 'onderhoud', 'spiermassa']
const PACES: Pace[] = ['rustig', 'gemiddeld', 'snel']
const STYLES: MacroStyle[] = ['gebalanceerd', 'eiwitrijk', 'koolhydraatarm', 'duursport']
const DIETS: Diet[] = ['alles', 'vegetarisch', 'veganistisch', 'lactosevrij']

/** Maak van willekeurige input (DB/API) een veilig profiel; ongeldige waarden vallen terug op defaults. */
export function sanitizeNutritionProfile(raw: unknown): NutritionProfile | null {
  if (raw == null || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  // Numeriek veld → korte string; niet-numeriek of leeg → ''. Max 3 tekens (geen onzin opslaan).
  const num = (v: unknown): string => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? String(Math.round(n)).slice(0, 3) : ''
  }
  const oneOf = <T,>(v: unknown, opts: T[], dflt: T): T => (opts.includes(v as T) ? (v as T) : dflt)
  return {
    sex: oneOf(r.sex, SEXES, 'm'),
    age: num(r.age),
    heightCm: num(r.heightCm),
    weightKg: num(r.weightKg),
    activity: oneOf(r.activity, ACTIVITIES, 'matig'),
    sessionsPerWeek: num(r.sessionsPerWeek),
    goal: oneOf(r.goal, GOALS, 'onderhoud'),
    pace: oneOf(r.pace, PACES, 'gemiddeld'),
    macroStyle: oneOf(r.macroStyle, STYLES, 'gebalanceerd'),
    diet: oneOf(r.diet, DIETS, 'alles'),
    targetWeightKg: num(r.targetWeightKg),
  }
}

export interface Meal { name: string; kcal: number; pct: number; tip: string }
export interface ExampleMeal { name: string; items: { amount: string; food: string }[] }
export interface TargetProjection {
  weightKg: number
  /** Verschil t.o.v. huidig gewicht (kg, negatief = eraf). */
  deltaKg: number
  direction: 'down' | 'up'
  /** Weken tot het doel bij het huidige tempo (null = onbereikbaar met dit doel). */
  weeks: number | null
  /** Verwachte verandering per week (kg, +/-). */
  weeklyRateKg: number
}
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
  /** Voorbeelddag met concrete porties, geschaald op jouw calorieën én dieet. */
  example: ExampleMeal[]
  /** Korte naam van de gekozen macro-stijl. */
  macroStyleLabel: string
  /** Korte naam van het gekozen dieet. */
  dietLabel: string
  /** Streefgewicht-tijdlijn (alleen als een geldig streefgewicht is opgegeven). */
  target: TargetProjection | null
}

export const ACTIVITY_FACTOR: Record<Activity, number> = {
  laag: 1.2,
  licht: 1.375,
  matig: 1.55,
  hoog: 1.725,
  'zeer-hoog': 1.9,
}

// Doel-afwijking t.o.v. onderhoud (×tempo). Default-tempo 'gemiddeld' → afvallen 0,8 / spiermassa 1,12.
const GOAL_DEVIATION: Record<Goal, number> = { afvallen: -0.2, onderhoud: 0, spiermassa: 0.12 }
const PACE_MULT: Record<Pace, number> = { rustig: 0.6, gemiddeld: 1, snel: 1.4 }
const PACE_LABEL: Record<Pace, string> = { rustig: 'Rustig', gemiddeld: 'Gemiddeld', snel: 'Snel' }
const PROTEIN_PER_KG: Record<Goal, number> = { afvallen: 2.2, onderhoud: 1.8, spiermassa: 2.0 }
const FAT_PER_KG: Record<Goal, number> = { afvallen: 0.8, onderhoud: 0.9, spiermassa: 1.0 }
const GOAL_LABEL: Record<Goal, string> = { afvallen: 'Afvallen (vetverlies)', onderhoud: 'Op gewicht blijven', spiermassa: 'Spiermassa opbouwen' }
const MACRO_LABEL: Record<MacroStyle, string> = { gebalanceerd: 'Gebalanceerd', eiwitrijk: 'Eiwitrijk', koolhydraatarm: 'Koolhydraatarm', duursport: 'Duursport' }
const DIET_LABEL: Record<Diet, string> = { alles: 'Alles', vegetarisch: 'Vegetarisch', veganistisch: 'Veganistisch', lactosevrij: 'Lactosevrij' }

const round = (n: number, step = 1) => Math.round(n / step) * step

/** Basaalmetabolisme (Mifflin-St Jeor), kcal/dag. */
export function bmrMifflin(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  return Math.round(base + (sex === 'm' ? 5 : -161))
}

/** Eiwit/vet per kg op basis van doel + macro-stijl; koolhydraten = de resterende energie. */
function macroGrams(goal: Goal, style: MacroStyle, kg: number, calories: number) {
  let proteinPerKg = PROTEIN_PER_KG[goal]
  let fatPerKg = FAT_PER_KG[goal]
  if (style === 'eiwitrijk') { proteinPerKg += 0.4; fatPerKg = Math.max(0.7, fatPerKg - 0.1) }
  else if (style === 'koolhydraatarm') { proteinPerKg += 0.2; fatPerKg += 0.5 }
  else if (style === 'duursport') { proteinPerKg = Math.max(1.6, proteinPerKg - 0.2); fatPerKg = Math.max(0.7, fatPerKg - 0.15) }
  const protein = round(kg * proteinPerKg)
  const fat = round(kg * fatPerKg)
  const carbs = Math.max(0, round((calories - protein * 4 - fat * 9) / 4))
  return { protein, fat, carbs }
}

/** Bouw het volledige sportvoedingsplan. */
export function buildNutritionPlan(input: NutritionInput): NutritionPlan {
  const kg = Math.max(25, Math.min(250, input.weightKg))
  const diet = input.diet ?? 'alles'
  const style = input.macroStyle ?? 'gebalanceerd'
  const pace = input.pace ?? 'gemiddeld'

  const bmr = bmrMifflin(input.sex, kg, input.heightCm, input.age)
  const tdee = Math.round(bmr * (ACTIVITY_FACTOR[input.activity] ?? 1.55))
  const goalFactor = 1 + GOAL_DEVIATION[input.goal] * PACE_MULT[pace]
  const calories = round(tdee * goalFactor, 10)

  const { protein, fat, carbs } = macroGrams(input.goal, style, kg, calories)

  const sessions = Math.max(0, Math.min(14, input.sessionsPerWeek ?? 3))
  // Basis 35 ml/kg; bij meer trainingen iets meer (zweetverlies).
  const hydrationMl = round(kg * 35 + (sessions >= 4 ? 500 : sessions >= 2 ? 300 : 0), 50)

  const meals = splitMeals(calories)
  const tips = buildTips(input.goal, sessions, diet, style)

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
  const example = exampleDay(calories, diet)
  const target = projectTarget(kg, input.targetWeightKg, weeklyChangeKg)

  return {
    bmr, tdee, calories, protein, fat, carbs, hydrationMl, goalLabel: GOAL_LABEL[input.goal], meals, tips,
    proteinPerMeal, bmi, bmiText, weeklyChangeKg,
    trainingDayCalories, trainingDayCarbs, restDayCalories, restDayCarbs, example,
    macroStyleLabel: `${MACRO_LABEL[style]} · ${PACE_LABEL[pace]}`, dietLabel: DIET_LABEL[diet], target,
  }
}

/** Tijdlijn naar een streefgewicht bij het huidige tempo. */
function projectTarget(kg: number, targetWeightKg: number | undefined, weeklyChangeKg: number): TargetProjection | null {
  if (targetWeightKg == null || !Number.isFinite(targetWeightKg)) return null
  const clamped = Math.max(25, Math.min(250, targetWeightKg))
  const deltaKg = Math.round((clamped - kg) * 10) / 10
  if (Math.abs(deltaKg) < 0.5) return null
  const direction: 'down' | 'up' = deltaKg < 0 ? 'down' : 'up'
  // Bereikbaar als het tempo de juiste richting op gaat.
  const reachable = (deltaKg < 0 && weeklyChangeKg < 0) || (deltaKg > 0 && weeklyChangeKg > 0)
  const weeks = reachable ? Math.ceil(Math.abs(deltaKg) / Math.abs(weeklyChangeKg)) : null
  return { weightKg: clamped, deltaKg, direction, weeks, weeklyRateKg: weeklyChangeKg }
}

// Basis-voorbeelddag (≈2200 kcal); de porties worden geschaald naar het persoonlijke caloriedoel.
// Per item kan een dieet-specifieke vervanger (`swap`) opgegeven worden.
type ExItem = { unit: 'g' | 'ml' | 'st'; food: string; n: number; swap?: Partial<Record<Diet, string>> }
const EXAMPLE_BASE: { name: string; items: ExItem[] }[] = [
  { name: 'Ontbijt', items: [
    { unit: 'g', food: 'havermout', n: 70 },
    { unit: 'ml', food: 'melk of sojadrink', n: 250, swap: { veganistisch: 'soja- of haverdrink', lactosevrij: 'lactosevrije melk of sojadrink' } },
    { unit: 'st', food: 'banaan', n: 1 },
    { unit: 'g', food: 'walnoten', n: 20 },
  ] },
  { name: 'Lunch', items: [
    { unit: 'g', food: 'volkorenbrood', n: 120 },
    { unit: 'g', food: 'kipfilet of tonijn', n: 100, swap: { vegetarisch: 'ei of kaas', veganistisch: 'tofu of kikkererwten' } },
    { unit: 'g', food: 'hummus of kaas', n: 30, swap: { veganistisch: 'hummus of avocado', lactosevrij: 'hummus of avocado' } },
    { unit: 'g', food: 'groenten / salade', n: 150 },
  ] },
  { name: 'Avondeten', items: [
    { unit: 'g', food: 'zalm of kipfilet', n: 170, swap: { vegetarisch: 'eieren + kaas of quorn', veganistisch: 'tofu, tempeh of linzen' } },
    { unit: 'g', food: 'rijst (droog gewogen)', n: 90 },
    { unit: 'g', food: 'groenten', n: 200 },
    { unit: 'ml', food: 'olijfolie', n: 10 },
  ] },
  { name: 'Tussendoor', items: [
    { unit: 'g', food: 'magere kwark', n: 250, swap: { veganistisch: 'sojayoghurt', lactosevrij: 'lactosevrije kwark of sojayoghurt' } },
    { unit: 'g', food: 'blauwe bessen', n: 80 },
    { unit: 'g', food: 'amandelen', n: 20 },
  ] },
]

function exampleDay(calories: number, diet: Diet): ExampleMeal[] {
  const factor = calories / 2200
  return EXAMPLE_BASE.map((meal) => ({
    name: meal.name,
    items: meal.items.map((it) => {
      const food = it.swap?.[diet] ?? it.food
      if (it.unit === 'st') {
        const n = Math.max(1, Math.round(it.n * factor))
        return { amount: `${n}×`, food }
      }
      const step = it.unit === 'ml' ? 10 : 5
      const n = Math.max(step, round(it.n * factor, step))
      return { amount: `${n} ${it.unit}`, food }
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

function buildTips(goal: Goal, sessions: number, diet: Diet, style: MacroStyle): string[] {
  const t: string[] = []
  if (goal === 'afvallen') t.push('Houd je eiwit hoog (≈2,2 g/kg) om spiermassa te behouden tijdens het afvallen.', 'Vul je bord met groenten — veel volume, weinig calorieën, lang verzadigd.')
  else if (goal === 'spiermassa') t.push('Eet net boven je verbruik en spreid eiwit over 4 momenten (≈0,4 g/kg per maaltijd).', 'Plan je grootste koolhydraat-portie ná de training voor herstel en groei.')
  else t.push('Tim je koolhydraten rond training en wedstrijd voor de beste prestatie.')
  if (style === 'koolhydraatarm') t.push('Koolhydraatarm: kies vezelrijke groenten en gezonde vetten (olijfolie, noten, avocado). Tim wel wat koolhydraten rond intensieve training.')
  else if (style === 'duursport') t.push('Duursport: laad koolhydraten in de uren vóór een lange inspanning en vul tijdens aan (sportdrank/gel vanaf ~60 min).')
  else if (style === 'eiwitrijk') t.push('Eiwitrijk: verdeel je eiwit gelijk over de dag voor maximale spieropbouw.')
  if (diet === 'vegetarisch') t.push('Vegetarisch: combineer granen + peulvruchten voor volwaardig eiwit en let op je ijzer- en B12-inname.')
  else if (diet === 'veganistisch') t.push('Veganistisch: vul aan met B12 en let op ijzer, omega-3 en voldoende eiwit uit soja, peulvruchten en noten.')
  else if (diet === 'lactosevrij') t.push('Lactosevrij: kies lactosevrije zuivel of verrijkte plantaardige varianten zodat je calcium en eiwit op peil blijven.')
  if (sessions >= 1) t.push('Vóór de training: licht verteerbare koolhydraten (banaan, brood). Ná de training: eiwit + koolhydraten binnen ~1 uur.')
  t.push('Drink verspreid over de dag; extra 500–750 ml per uur intensieve inspanning.')
  t.push('Dit is een richtlijn, geen medisch advies — bij blessures, allergieën of een medische aandoening: raadpleeg een (sport)diëtist.')
  return t
}
