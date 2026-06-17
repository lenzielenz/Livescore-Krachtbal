'use client'

import { useEffect, useMemo, useState } from 'react'

import {
  type Activity,
  buildNutritionPlan,
  type Diet,
  type Goal,
  type MacroStyle,
  type NutritionProfile,
  type Pace,
  type Sex,
} from '@/lib/nutrition-plan'
import {
  hydrationSchedule,
  matchDayFuel,
  micronutrientFocus,
  proteinTiming,
  supplements,
} from '@/lib/nutrition-extras'
import { buildShoppingList, buildWeekPlan, spreadTrainingDays } from '@/lib/nutrition-week'
import type { TrackerStore } from '@/lib/calorie-tracker'
import { CalorieTracker } from './CalorieTracker'
import './voeding.css'

const DAY_ABBR = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

type TabKey = 'vandaag' | 'overzicht' | 'maaltijden' | 'timing' | 'wedstrijd' | 'aanvulling' | 'weekplan'
const TABS: { k: TabKey; ico: string; label: string }[] = [
  { k: 'vandaag', ico: '🔥', label: 'Vandaag' },
  { k: 'overzicht', ico: '📊', label: 'Overzicht' },
  { k: 'maaltijden', ico: '🍽️', label: 'Maaltijden' },
  { k: 'timing', ico: '⏱️', label: 'Timing' },
  { k: 'wedstrijd', ico: '🏟️', label: 'Wedstrijddag' },
  { k: 'aanvulling', ico: '💊', label: 'Aanvulling' },
  { k: 'weekplan', ico: '📅', label: 'Weekplan' },
]

const ACTIVITIES: { v: Activity; label: string; hint: string }[] = [
  { v: 'laag', label: 'Laag', hint: 'weinig beweging, zittend werk' },
  { v: 'licht', label: 'Licht', hint: '1–2× sport per week' },
  { v: 'matig', label: 'Matig', hint: '3–4× sport per week' },
  { v: 'hoog', label: 'Hoog', hint: '5–6× sport per week' },
  { v: 'zeer-hoog', label: 'Zeer hoog', hint: 'dagelijks + fysiek werk' },
]
const GOALS: { v: Goal; label: string; ico: string }[] = [
  { v: 'afvallen', label: 'Afvallen', ico: '🔥' },
  { v: 'onderhoud', label: 'Op gewicht', ico: '⚖️' },
  { v: 'spiermassa', label: 'Spiermassa', ico: '💪' },
  { v: 'recompositie', label: 'Spier + vermageren', ico: '🔁' },
]
const PACES: { v: Pace; label: string; hint: string }[] = [
  { v: 'rustig', label: 'Rustig', hint: 'klein verschil, makkelijk vol te houden' },
  { v: 'gemiddeld', label: 'Gemiddeld', hint: 'de gulden middenweg' },
  { v: 'snel', label: 'Snel', hint: 'groter verschil, meer discipline' },
]
const STYLES: { v: MacroStyle; label: string; ico: string }[] = [
  { v: 'gebalanceerd', label: 'Gebalanceerd', ico: '⚖️' },
  { v: 'eiwitrijk', label: 'Eiwitrijk', ico: '🥩' },
  { v: 'koolhydraatarm', label: 'Koolhydraatarm', ico: '🥑' },
  { v: 'duursport', label: 'Duursport', ico: '🚴' },
]
const DIETS: { v: Diet; label: string; ico: string }[] = [
  { v: 'alles', label: 'Alles', ico: '🍽️' },
  { v: 'vegetarisch', label: 'Vegetarisch', ico: '🥦' },
  { v: 'veganistisch', label: 'Veganistisch', ico: '🌱' },
  { v: 'lactosevrij', label: 'Lactosevrij', ico: '🥛' },
]

const changeText = (kg: number): string => {
  const a = Math.abs(kg).toString().replace('.', ',')
  if (kg <= -0.1) return `≈ ${a} kg/week eraf`
  if (kg >= 0.1) return `≈ ${a} kg/week erbij`
  return 'gewicht blijft stabiel'
}

// Streefdatum: vandaag + weken, in leesbaar NL.
const etaText = (weeks: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + weeks * 7)
  return d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Macrodonut: drie segmenten (eiwit/koolhydraten/vet) naar kcal-aandeel.
function MacroDonut({ p, c, f }: { p: number; c: number; f: number }) {
  const total = p + c + f || 1
  const R = 52
  const C = 2 * Math.PI * R
  const segs = [
    { val: p, color: '#ff6b6b' },
    { val: c, color: '#4cc9f0' },
    { val: f, color: '#ffd166' },
  ]
  let offset = 0
  return (
    <svg className="vd-donut" viewBox="0 0 140 140" role="img" aria-label="Macroverdeling">
      <circle cx="70" cy="70" r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="16" />
      {segs.map((s, i) => {
        const len = (s.val / total) * C
        const el = (
          <circle
            key={i}
            cx="70"
            cy="70"
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth="16"
            strokeLinecap="butt"
            strokeDasharray={`${len} ${C - len}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 70 70)"
          />
        )
        offset += len
        return el
      })}
      <text x="70" y="64" className="vd-donut-pct">{Math.round((c / total) * 100)}%</text>
      <text x="70" y="82" className="vd-donut-lbl">koolhydr.</text>
    </svg>
  )
}

export function NutritionPlanner({ initial, canSave = false, tracker = null }: { initial?: NutritionProfile | null; canSave?: boolean; tracker?: TrackerStore | null }) {
  const [sex, setSex] = useState<Sex>(initial?.sex ?? 'm')
  const [age, setAge] = useState(initial?.age || '25')
  const [height, setHeight] = useState(initial?.heightCm || '178')
  const [weight, setWeight] = useState(initial?.weightKg || '72')
  const [activity, setActivity] = useState<Activity>(initial?.activity ?? 'matig')
  const [sessions, setSessions] = useState(initial?.sessionsPerWeek || '3')
  const [goal, setGoal] = useState<Goal>(initial?.goal ?? 'onderhoud')
  const [pace, setPace] = useState<Pace>(initial?.pace ?? 'gemiddeld')
  const [style, setStyle] = useState<MacroStyle>(initial?.macroStyle ?? 'gebalanceerd')
  const [diet, setDiet] = useState<Diet>(initial?.diet ?? 'alles')
  const [target, setTarget] = useState(initial?.targetWeightKg || '')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [tab, setTab] = useState<TabKey>('vandaag')
  const [weekShift, setWeekShift] = useState(0)
  const [copied, setCopied] = useState(false)
  // Trainingsdagen voor de carb-cycling, standaard gespreid uit het aantal trainingen/week.
  const [trainDays, setTrainDays] = useState<boolean[]>(() => spreadTrainingDays(Number(initial?.sessionsPerWeek) || 3))

  const save = async () => {
    setSaveState('saving')
    try {
      const res = await fetch('/api/profile/nutrition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sex, age, heightCm: height, weightKg: weight, activity, sessionsPerWeek: sessions, goal, pace, macroStyle: style, diet, targetWeightKg: target }),
      })
      setSaveState(res.ok ? 'saved' : 'error')
    } catch {
      setSaveState('error')
    }
  }
  // Zodra er iets verandert, vervalt de "opgeslagen"-bevestiging.
  useEffect(() => {
    setSaveState((s) => (s === 'saved' ? 'idle' : s))
  }, [sex, age, height, weight, activity, sessions, goal, pace, style, diet, target])

  // Trainingsdagen volgen standaard het aantal trainingen/week (gebruiker kan nadien zelf toggelen).
  useEffect(() => {
    setTrainDays(spreadTrainingDays(Number(sessions) || 0))
  }, [sessions])

  // Live herberekening — geen knop nodig, alles past zich meteen aan.
  const { plan, err } = useMemo(() => {
    const a = Number(age), h = Number(height), w = Number(weight), s = Number(sessions)
    if (!(a >= 10 && a <= 100) || !(h >= 100 && h <= 220) || !(w >= 25 && w <= 250)) {
      return { plan: null, err: 'Vul een geldige leeftijd (10–100), lengte (100–220 cm) en gewicht (25–250 kg) in.' }
    }
    const tw = Number(target)
    return {
      plan: buildNutritionPlan({
        sex, age: a, heightCm: h, weightKg: w, activity, goal,
        sessionsPerWeek: Number.isFinite(s) ? s : 3,
        pace, macroStyle: style, diet,
        targetWeightKg: target.trim() !== '' && Number.isFinite(tw) ? tw : undefined,
      }),
      err: null,
    }
  }, [sex, age, height, weight, activity, sessions, goal, pace, style, diet, target])

  const macroKcal = plan ? { p: plan.protein * 4, c: plan.carbs * 4, f: plan.fat * 9 } : null
  const macroTotal = macroKcal ? macroKcal.p + macroKcal.c + macroKcal.f || 1 : 1

  // Carb-cycling: trainingsdagen krijgen plan.trainingDayCalories, rustdagen plan.restDayCalories.
  const weekOpts = useMemo(
    () => (plan ? { trainingDays: trainDays, trainingCalories: plan.trainingDayCalories, restCalories: plan.restDayCalories, shift: weekShift } : undefined),
    [plan, trainDays, weekShift],
  )
  const week = useMemo(() => (plan ? buildWeekPlan(plan.calories, diet, weekOpts) : null), [plan, diet, weekOpts])
  const shopping = useMemo(() => (plan ? buildShoppingList(plan.calories, diet, weekOpts) : null), [plan, diet, weekOpts])

  // Op-maat extra's, afgeleid van het plan.
  const protein = useMemo(() => (plan ? proteinTiming(plan.protein) : null), [plan])
  const hydration = useMemo(() => (plan ? hydrationSchedule(plan.hydrationMl, Number(sessions) || 0) : null), [plan, sessions])
  const fuel = useMemo(() => (plan ? matchDayFuel(Number(weight) || 70) : null), [plan, weight])
  const supps = useMemo(() => (plan ? supplements(goal, diet, Number(sessions) || 0) : null), [plan, goal, diet, sessions])
  const micros = useMemo(() => (plan ? micronutrientFocus(diet) : null), [plan, diet])

  const copyShopping = async () => {
    if (!shopping) return
    const text = shopping.map((g) => `${g.cat}\n${g.items.map((it) => `- ${it.amount} ${it.food}`).join('\n')}`).join('\n\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard niet beschikbaar — stil negeren */
    }
  }

  return (
    <div className="vd">
      <form className="vd-form" onSubmit={(e) => e.preventDefault()}>
        <span className="vd-form-live">⚡ Live — alles past zich meteen aan</span>
        <div className="vd-field">
          <span className="vd-lbl">Geslacht</span>
          <div className="vd-chips">
            {(['m', 'v'] as const).map((s) => (
              <button key={s} type="button" className={`vd-chip${sex === s ? ' on' : ''}`} onClick={() => setSex(s)}>{s === 'm' ? 'Man' : 'Vrouw'}</button>
            ))}
          </div>
        </div>
        <div className="vd-row3">
          <label className="vd-field"><span className="vd-lbl">Leeftijd</span><input className="vd-input" type="number" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} /></label>
          <label className="vd-field"><span className="vd-lbl">Lengte (cm)</span><input className="vd-input" type="number" inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value)} /></label>
          <label className="vd-field"><span className="vd-lbl">Gewicht (kg)</span><input className="vd-input" type="number" inputMode="numeric" value={weight} onChange={(e) => setWeight(e.target.value)} /></label>
        </div>
        <div className="vd-row2">
          <label className="vd-field">
            <span className="vd-lbl">Activiteit</span>
            <select className="vd-input" value={activity} onChange={(e) => setActivity(e.target.value as Activity)}>
              {ACTIVITIES.map((a) => <option key={a.v} value={a.v}>{a.label} — {a.hint}</option>)}
            </select>
          </label>
          <label className="vd-field"><span className="vd-lbl">Trainingen/week</span><input className="vd-input" type="number" inputMode="numeric" value={sessions} onChange={(e) => setSessions(e.target.value)} /></label>
        </div>
        <div className="vd-field">
          <span className="vd-lbl">Doel</span>
          <div className="vd-chips">
            {GOALS.map((g) => (
              <button key={g.v} type="button" className={`vd-chip${goal === g.v ? ' on' : ''}`} onClick={() => setGoal(g.v)}>{g.ico} {g.label}</button>
            ))}
          </div>
        </div>
        {goal !== 'onderhoud' && (
          <>
            <div className="vd-field">
              <span className="vd-lbl">Tempo</span>
              <div className="vd-chips">
                {PACES.map((p) => (
                  <button key={p.v} type="button" className={`vd-chip${pace === p.v ? ' on' : ''}`} onClick={() => setPace(p.v)} title={p.hint}>{p.label}</button>
                ))}
              </div>
            </div>
            <label className="vd-field">
              <span className="vd-lbl">Streefgewicht (kg) <span className="vd-opt">optioneel</span></span>
              <input className="vd-input" type="number" inputMode="numeric" placeholder="bijv. 68" value={target} onChange={(e) => setTarget(e.target.value)} />
            </label>
          </>
        )}
        <div className="vd-field">
          <span className="vd-lbl">Macro-stijl</span>
          <div className="vd-chips">
            {STYLES.map((s) => (
              <button key={s.v} type="button" className={`vd-chip${style === s.v ? ' on' : ''}`} onClick={() => setStyle(s.v)}>{s.ico} {s.label}</button>
            ))}
          </div>
        </div>
        <div className="vd-field">
          <span className="vd-lbl">Dieet</span>
          <div className="vd-chips">
            {DIETS.map((d) => (
              <button key={d.v} type="button" className={`vd-chip${diet === d.v ? ' on' : ''}`} onClick={() => setDiet(d.v)}>{d.ico} {d.label}</button>
            ))}
          </div>
        </div>
        {err && <p className="vd-err">{err}</p>}
        {canSave && (
          <div className="vd-save">
            <button
              type="button"
              className={`vd-go vd-save-btn${saveState === 'saved' ? ' done' : ''}`}
              onClick={save}
              disabled={saveState === 'saving' || !!err}
            >
              {saveState === 'saving' ? '⏳ Bewaren…' : saveState === 'saved' ? '✓ Opgeslagen in mijn profiel' : '💾 Bewaar in mijn profiel'}
            </button>
            <span className="vd-save-hint">
              {saveState === 'error'
                ? 'Bewaren mislukt — probeer opnieuw.'
                : 'Je gegevens worden bij je account bewaard, zodat ze de volgende keer al ingevuld staan.'}
            </span>
          </div>
        )}
      </form>

      {plan && macroKcal && (
        <div className="vd-result">
          {/* Tabbladen — spring meteen naar wat je zoekt, geen eindeloze scroll. */}
          <nav className="vd-tabs" aria-label="Voedingsplan-onderdelen">
            {TABS.map((t) => (
              <button key={t.k} type="button" className={`vd-tab${tab === t.k ? ' on' : ''}`} onClick={() => setTab(t.k)} aria-pressed={tab === t.k}>
                <span aria-hidden>{t.ico}</span> <span className="vd-tab-lbl">{t.label}</span>
              </button>
            ))}
          </nav>

          {/* Vandaag — de dagelijkse tracker staat vooraan zodat je meteen voeding kan toevoegen. */}
          <section className={`vd-panel${tab === 'vandaag' ? ' on' : ''}`}>
            <CalorieTracker
              calories={plan.calories}
              protein={plan.protein}
              carbs={plan.carbs}
              fat={plan.fat}
              targetWeightKg={Number(target) > 0 ? Number(target) : null}
              initialStore={tracker}
              canSave={canSave}
            />
          </section>

          {/* Overzicht */}
          <section className={`vd-panel${tab === 'overzicht' ? ' on' : ''}`}>
            <div className="vd-hero">
              <span className="vd-hero-goal">{plan.goalLabel}</span>
              <span className="vd-hero-kcal">{plan.calories.toLocaleString('nl-BE')}</span>
              <span className="vd-hero-unit">kcal / dag (gemiddeld)</span>
              <span className="vd-hero-sub">basis {plan.bmr} · verbruik ±{plan.tdee} kcal · 💧 {(plan.hydrationMl / 1000).toFixed(1)} L water/dag</span>
              <span className="vd-hero-sub">BMI {plan.bmi.toString().replace('.', ',')} ({plan.bmiText}) · {changeText(plan.weeklyChangeKg)} · 🥄 {plan.proteinPerMeal} g eiwit per maaltijd</span>
              <div className="vd-hero-pills">
                <span className="vd-pill">{plan.macroStyleLabel}</span>
                <span className="vd-pill">🍽️ {plan.dietLabel}</span>
              </div>
            </div>

            {plan.target && (
              <div className={`vd-target${plan.target.weeks == null ? ' off' : ''}`}>
                <span className="vd-target-ico" aria-hidden>🎯</span>
                {plan.target.weeks == null ? (
                  <span className="vd-target-txt">
                    Met dit doel ga je niet richting <b>{plan.target.weightKg} kg</b>. Kies een passend doel
                    ({plan.target.direction === 'down' ? 'afvallen' : 'spiermassa/op gewicht'}) om er te geraken.
                  </span>
                ) : (
                  <span className="vd-target-txt">
                    Naar <b>{plan.target.weightKg} kg</b> ({plan.target.deltaKg.toString().replace('.', ',')} kg):
                    ± <b>{plan.target.weeks} weken</b> bij dit tempo — rond <b>{etaText(plan.target.weeks)}</b>.
                  </span>
                )}
              </div>
            )}

            <div className="vd-macrowrap">
              <MacroDonut p={macroKcal.p} c={macroKcal.c} f={macroKcal.f} />
              <div className="vd-macros">
                {([
                  { k: 'Eiwit', g: plan.protein, kcal: macroKcal.p, cls: 'p', tip: 'spierbehoud & herstel' },
                  { k: 'Koolhydraten', g: plan.carbs, kcal: macroKcal.c, cls: 'c', tip: 'energie & prestatie' },
                  { k: 'Vet', g: plan.fat, kcal: macroKcal.f, cls: 'f', tip: 'hormonen & vitamines' },
                ] as const).map((m) => (
                  <div key={m.k} className={`vd-macro ${m.cls}`}>
                    <span className="vd-macro-g">{m.g} g</span>
                    <span className="vd-macro-k">{m.k}</span>
                    <span className="vd-macro-bar"><i style={{ width: `${Math.round((m.kcal / macroTotal) * 100)}%` }} /></span>
                    <span className="vd-macro-sub">{Math.round((m.kcal / macroTotal) * 100)}% · {m.tip}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Maaltijden */}
          <section className={`vd-panel${tab === 'maaltijden' ? ' on' : ''}`}>
            <h3 className="vd-h3">📅 Koolhydraten timen: trainingsdag vs rustdag</h3>
            <div className="vd-split">
              <div className="vd-day train">
                <span className="vd-day-h">🏃 Trainings-/wedstrijddag</span>
                <span className="vd-day-kcal">{plan.trainingDayCalories.toLocaleString('nl-BE')} kcal</span>
                <span className="vd-day-sub">{plan.trainingDayCarbs} g koolhydraten — meer brandstof rond inspanning</span>
              </div>
              <div className="vd-day rest">
                <span className="vd-day-h">🛋️ Rustdag</span>
                <span className="vd-day-kcal">{plan.restDayCalories.toLocaleString('nl-BE')} kcal</span>
                <span className="vd-day-sub">{plan.restDayCarbs} g koolhydraten — eiwit & vet blijven gelijk</span>
              </div>
            </div>

            <h3 className="vd-h3">🍳 Voorbeelddag op maat <span className="vd-h3-sub">{plan.dietLabel.toLowerCase()}</span></h3>
            <div className="vd-meals">
              {plan.example.map((m) => (
                <div key={m.name} className="vd-meal">
                  <span className="vd-meal-top"><b>{m.name}</b></span>
                  <ul className="vd-ex">
                    {m.items.map((it, i) => (
                      <li key={i}><b>{it.amount}</b> {it.food}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <h3 className="vd-h3">🍽️ Verdeling over de dag</h3>
            <div className="vd-meals">
              {plan.meals.map((m) => (
                <div key={m.name} className="vd-meal">
                  <span className="vd-meal-top"><b>{m.name}</b><span className="vd-meal-kcal">{m.kcal} kcal · {m.pct}%</span></span>
                  <span className="vd-meal-tip">{m.tip}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Timing */}
          <section className={`vd-panel${tab === 'timing' ? ' on' : ''}`}>
            {protein && (
              <>
                <h3 className="vd-h3">🥩 Eiwit-timing <span className="vd-h3-sub">spreid voor maximaal herstel</span></h3>
                <div className="vd-timeline">
                  {protein.map((s) => (
                    <div key={s.moment} className="vd-tl-item">
                      <span className="vd-tl-when">{s.moment}</span>
                      <span className="vd-tl-what"><b>{s.grams} g</b> eiwit</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {hydration && (
              <>
                <h3 className="vd-h3">💧 Hydratatieschema <span className="vd-h3-sub">±{(plan.hydrationMl / 1000).toFixed(1)} L/dag</span></h3>
                <div className="vd-timeline">
                  {hydration.map((s) => (
                    <div key={s.moment} className="vd-tl-item">
                      <span className="vd-tl-when">{s.moment}</span>
                      <span className="vd-tl-what"><b>{s.ml} ml</b> — {s.tip}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* Wedstrijddag */}
          <section className={`vd-panel${tab === 'wedstrijd' ? ' on' : ''}`}>
            {fuel && (
              <>
                <h3 className="vd-h3">🏟️ Wedstrijddag-fueling <span className="vd-h3-sub">tijdlijn op maat</span></h3>
                <div className="vd-fuel">
                  {fuel.map((s, i) => (
                    <div key={i} className="vd-fuel-step">
                      <span className="vd-fuel-when">{s.when}</span>
                      <span className="vd-fuel-what">{s.what}</span>
                      <span className="vd-fuel-why">{s.why}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* Aanvulling: supplementen + micronutriënten + sporttips */}
          <section className={`vd-panel${tab === 'aanvulling' ? ' on' : ''}`}>
            {supps && (
              <>
                <h3 className="vd-h3">💊 Supplementen <span className="vd-h3-sub">evidence-based</span></h3>
                <div className="vd-supps">
                  {supps.map((s, i) => (
                    <div key={i} className={`vd-supp${s.name === 'Let op' ? ' note' : ''}`}>
                      <span className="vd-supp-top">
                        <b>{s.name}</b>
                        {s.name !== 'Let op' && <span className={`vd-supp-tag t${s.tag === 'Sterk bewezen' ? '1' : s.tag === 'Nuttig' ? '2' : '3'}`}>{s.tag}</span>}
                      </span>
                      {s.dose !== '—' && <span className="vd-supp-dose">{s.dose}</span>}
                      <span className="vd-supp-why">{s.why}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {micros && (
              <>
                <h3 className="vd-h3">🔬 Aandachtspunten <span className="vd-h3-sub">{plan.dietLabel.toLowerCase()}</span></h3>
                <div className="vd-micros">
                  {micros.map((m, i) => (
                    <div key={i} className="vd-micro">
                      <span className="vd-micro-n">{m.nutrient}</span>
                      <span className="vd-micro-why">{m.why}</span>
                      <span className="vd-micro-src">📍 {m.sources}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            <h3 className="vd-h3">⚡ Sporttips</h3>
            <ul className="vd-tips">
              {plan.tips.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </section>

          {/* Weekplan + boodschappenlijst */}
          <section className={`vd-panel${tab === 'weekplan' ? ' on' : ''}`}>
            {week && shopping && (
              <div className="vd-week">
                <h3 className="vd-h3">
                  📅 Jouw week-eetplan <span className="vd-h3-sub">7 dagen, gevarieerd</span>
                  <button type="button" className="vd-copy" onClick={() => window.print()}>🖨️ Print / PDF</button>
                </h3>

                {/* Carb-cycling: kies je trainingsdagen → meer koolhydraten/calorieën op die dagen. */}
                <div className="vd-cycle">
                  <span className="vd-cycle-lbl">🏃 Trainingsdagen (meer koolhydraten):</span>
                  <div className="vd-chips">
                    {DAY_ABBR.map((d, i) => (
                      <button
                        key={i}
                        type="button"
                        className={`vd-chip vd-chip-day${trainDays[i] ? ' on' : ''}`}
                        onClick={() => setTrainDays((arr) => arr.map((v, j) => (j === i ? !v : v)))}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                  <button type="button" className="vd-week-print vd-shuffle" onClick={() => setWeekShift((s) => s + 1)}>🔀 Andere variatie</button>
                </div>

                <div className="vd-week-grid">
                  {week.map((d) => (
                    <div key={d.day} className={`vd-wday ${d.kind}`}>
                      <span className="vd-wday-h">
                        {d.day}
                        <span className="vd-wday-meta">
                          {d.kind === 'train' ? '🏃 ' : d.kind === 'rest' ? '🛋️ ' : ''}{d.calories.toLocaleString('nl-BE')} kcal
                        </span>
                      </span>
                      {d.meals.map((m) => (
                        <div key={m.name} className="vd-wmeal">
                          <span className="vd-wmeal-h">{m.name}</span>
                          <span className="vd-wmeal-items">{m.items.map((it) => `${it.amount} ${it.food}`).join(' · ')}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                <h3 className="vd-h3">
                  🛒 Boodschappenlijst voor de week <span className="vd-h3-sub">{plan.dietLabel.toLowerCase()}</span>
                  <button type="button" className="vd-copy" onClick={copyShopping}>{copied ? '✓ Gekopieerd' : '📋 Kopieer lijst'}</button>
                </h3>
                <div className="vd-shop">
                  {shopping.map((g) => (
                    <div key={g.cat} className="vd-shop-cat">
                      <span className="vd-shop-h">{g.cat}</span>
                      <ul className="vd-shop-list">
                        {g.items.map((it, i) => (
                          <li key={i}><b>{it.amount}</b> {it.food}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <p className="vd-week-note">Richtlijn: porties zijn geschaald op je daginname en gemiddeld over de week — pas gerust aan naar smaak en honger.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
