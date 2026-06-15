// ── Sportvoeding-extra's ─────────────────────────────────────────────────────────────────────────
// Pure, los testbare bouwstenen die de planner verdiepen: eiwit-timing, een hydratatieschema, een
// wedstrijddag-fueling tijdlijn, evidence-based supplementenadvies en micronutriënt-aandachtspunten
// per dieet. Onderbouwd op gangbare sportvoedingsrichtlijnen (eiwit ~0,4 g/kg/maaltijd, koolhydraat-
// laden 1–3 g/kg rond wedstrijd, 30–60 g KH/uur tijdens duurinspanning, cafeïne ~3 mg/kg, creatine 3–5 g).

import type { Diet, Goal } from './nutrition-plan'

const round = (n: number, step = 1) => Math.round(n / step) * step

// ── Eiwit-timing ───────────────────────────────────────────────────────────────────────────────
export interface ProteinSlot { moment: string; grams: number }
/** Verdeel de dagelijkse eiwitinname over 4 momenten voor maximale spieropbouw. */
export function proteinTiming(proteinGrams: number): ProteinSlot[] {
  const slots: { moment: string; pct: number }[] = [
    { moment: 'Ontbijt', pct: 0.25 },
    { moment: 'Lunch', pct: 0.3 },
    { moment: 'Avondeten', pct: 0.3 },
    { moment: 'Rond training / voor het slapen', pct: 0.15 },
  ]
  return slots.map((s) => ({ moment: s.moment, grams: round(proteinGrams * s.pct) }))
}

// ── Hydratatieschema ─────────────────────────────────────────────────────────────────────────────
export interface HydrationSlot { moment: string; ml: number; tip: string }
/** Spreid de dagelijkse vochtinname over de dag, met extra rond de training. */
export function hydrationSchedule(totalMl: number, sessionsPerWeek: number): HydrationSlot[] {
  const total = Math.max(0, totalMl)
  const per = round(total / 5, 50)
  const base: { moment: string; tip: string }[] = [
    { moment: 'Bij het opstaan', tip: 'Begin de dag met 1–2 glazen water.' },
    { moment: 'Voormiddag', tip: 'Verspreid kleine slokken; hou een fles bij de hand.' },
    { moment: 'Rond de middag', tip: 'Drink bij elke maaltijd een glas.' },
    { moment: 'Namiddag', tip: 'Blijf aanvullen, ook zonder dorst.' },
    { moment: 'Avond', tip: 'Tot ~1 u voor het slapen, anders verstoort het je nachtrust.' },
  ]
  const slots = base.map((b) => ({ moment: b.moment, ml: per, tip: b.tip }))
  if (sessionsPerWeek >= 1) {
    slots.push({ moment: 'Rond de training', ml: 500, tip: 'Extra 500–750 ml per uur intensieve inspanning, met kleine slokken tijdens.' })
  }
  return slots
}

// ── Wedstrijddag-fueling ─────────────────────────────────────────────────────────────────────────
export interface FuelStep { when: string; what: string; why: string }
/** Tijdlijn voor een wedstrijddag, met porties geschaald op het lichaamsgewicht. */
export function matchDayFuel(weightKg: number): FuelStep[] {
  const kg = Math.max(25, Math.min(250, weightKg))
  return [
    { when: '3–4 u ervoor', what: `Koolhydraatrijke maaltijd (~${round(kg * 2, 5)} g KH): pasta/rijst + mager eiwit, weinig vet & vezels.`, why: 'Vult je glycogeenvoorraad zonder een zware maag.' },
    { when: '1–1,5 u ervoor', what: `Lichte snack (~${round(kg * 1, 5)} g KH): banaan, witte boterham met honing of een reep.`, why: 'Laatste, snel verteerbare energie.' },
    { when: '15 min ervoor', what: '200–300 ml water (of sportdrank bij warmte/lange duur).', why: 'Start goed gehydrateerd aan de wedstrijd.' },
    { when: 'Tijdens (>60 min)', what: '30–60 g KH per uur via sportdrank/gel + kleine slokken water.', why: 'Houdt je energie en focus op peil.' },
    { when: 'Binnen 1 u erna', what: `Herstel: ~${round(kg * 0.3)} g eiwit + ~${round(kg * 1, 5)} g KH (kwark + fruit of shake + banaan).`, why: 'Spierherstel én glycogeen weer aanvullen ("herstelvenster").' },
    { when: "'s Avonds", what: 'Volwaardige maaltijd: eiwitbron + zetmeel + veel groenten.', why: 'Rondt het herstel af voor de volgende dag.' },
  ]
}

// ── Supplementenadvies (evidence-based) ──────────────────────────────────────────────────────────
export interface Supplement { name: string; dose: string; why: string; tag: 'Sterk bewezen' | 'Nuttig' | 'Situationeel' }
/** Onderbouwd supplementenadvies, afgestemd op doel, dieet en trainingsvolume. */
export function supplements(goal: Goal, diet: Diet, sessionsPerWeek: number): Supplement[] {
  const list: Supplement[] = [
    { name: 'Creatine monohydraat', dose: '3–5 g per dag, elke dag', why: 'Best onderbouwde supplement voor kracht, explosiviteit en spiermassa.', tag: 'Sterk bewezen' },
    { name: 'Vitamine D', dose: '1000–2000 IE/dag (vooral winter & binnensporters)', why: 'Ondersteunt botten, spierfunctie en immuniteit; tekort is wijdverbreid.', tag: 'Nuttig' },
  ]
  if (goal === 'spiermassa' || goal === 'afvallen' || goal === 'recompositie') {
    list.push({ name: 'Eiwitpoeder (whey of plantaardig)', dose: '20–30 g indien je je eiwitdoel niet met voeding haalt', why: 'Handige manier om voldoende eiwit te halen voor herstel/spierbehoud.', tag: 'Nuttig' })
  }
  if (sessionsPerWeek >= 3) {
    list.push({ name: 'Cafeïne', dose: '3 mg/kg, ~45–60 min voor de wedstrijd', why: 'Verbetert alertheid en uithouding; bouw tolerantie niet te hoog op.', tag: 'Situationeel' })
    list.push({ name: 'Sportdrank / koolhydraten', dose: '30–60 g KH per uur bij inspanning >60 min', why: 'Houdt prestatie op peil tijdens lange of intense sessies.', tag: 'Situationeel' })
  }
  if (diet === 'veganistisch') {
    list.push({ name: 'Vitamine B12', dose: 'Dagelijks supplement (essentieel)', why: 'Komt vrijwel niet voor in plantaardige voeding — onmisbaar bij veganisme.', tag: 'Sterk bewezen' })
    list.push({ name: 'Algenolie (omega-3)', dose: '250–500 mg EPA/DHA per dag', why: 'Plantaardige bron van omega-3 zonder vette vis.', tag: 'Nuttig' })
  } else if (diet === 'vegetarisch') {
    list.push({ name: 'Vitamine B12', dose: 'Supplement of verrijkte voeding overwegen', why: 'Inname kan laag zijn zonder vlees/vis.', tag: 'Situationeel' })
  }
  list.push({ name: 'Let op', dose: '—', why: 'Supplementen vullen een goed dieet aan, ze vervangen het niet. Kies bij twijfel anti-doping-gekeurde (NZVT) producten.', tag: 'Situationeel' })
  return list
}

// ── Micronutriënt-aandachtspunten per dieet ──────────────────────────────────────────────────────
export interface MicroFocus { nutrient: string; why: string; sources: string }
/** Welke micronutriënten extra aandacht verdienen bij dit dieet. */
export function micronutrientFocus(diet: Diet): MicroFocus[] {
  switch (diet) {
    case 'veganistisch':
      return [
        { nutrient: 'Vitamine B12', why: 'Niet in plantaardige voeding — supplement nodig.', sources: 'supplement, verrijkte plantendrink' },
        { nutrient: 'IJzer', why: 'Plantaardig ijzer wordt minder goed opgenomen.', sources: 'peulvruchten, tofu, volkoren + vitamine C erbij' },
        { nutrient: 'Omega-3 (EPA/DHA)', why: 'Zonder vis lastig binnen te krijgen.', sources: 'lijnzaad, walnoten, algenolie' },
        { nutrient: 'Calcium', why: 'Geen zuivel als bron.', sources: 'verrijkte plantendrink, tofu, groene groenten' },
        { nutrient: 'Zink & jodium', why: 'Kunnen krap zijn op een plantaardig dieet.', sources: 'noten, zaden, volkoren, gejodeerd zout' },
      ]
    case 'vegetarisch':
      return [
        { nutrient: 'IJzer', why: 'Zonder vlees vraagt het wat aandacht.', sources: 'eieren, peulvruchten, volkoren + vitamine C' },
        { nutrient: 'Vitamine B12', why: 'Voldoende via zuivel/eieren, anders aanvullen.', sources: 'eieren, zuivel, verrijkte voeding' },
        { nutrient: 'Omega-3', why: 'Minder zonder vis.', sources: 'lijnzaad, walnoten, eieren met omega-3' },
      ]
    case 'lactosevrij':
      return [
        { nutrient: 'Calcium', why: 'Mis je makkelijk zonder gewone zuivel.', sources: 'lactosevrije zuivel, verrijkte plantendrink, groene groenten' },
        { nutrient: 'Vitamine D', why: 'Werkt samen met calcium voor sterke botten.', sources: 'vette vis, eieren, supplement' },
      ]
    default:
      return [
        { nutrient: 'IJzer', why: 'Belangrijk voor zuurstoftransport en uithouding.', sources: 'rood vlees, gevogelte, peulvruchten' },
        { nutrient: 'Calcium & vitamine D', why: 'Voor sterke botten bij een fysieke sport.', sources: 'zuivel, vette vis, groene groenten' },
        { nutrient: 'Omega-3', why: 'Ondersteunt herstel en hart.', sources: 'vette vis (zalm, makreel), noten' },
      ]
  }
}
