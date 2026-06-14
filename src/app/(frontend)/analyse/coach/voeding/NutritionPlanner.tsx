'use client'

import { useState } from 'react'

import { type Activity, buildNutritionPlan, type Goal, type NutritionPlan, type Sex } from '@/lib/nutrition-plan'
import './voeding.css'

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
]

const changeText = (kg: number): string => {
  const a = Math.abs(kg).toString().replace('.', ',')
  if (kg <= -0.1) return `≈ ${a} kg/week eraf`
  if (kg >= 0.1) return `≈ ${a} kg/week erbij`
  return 'gewicht blijft stabiel'
}

export function NutritionPlanner() {
  const [sex, setSex] = useState<Sex>('m')
  const [age, setAge] = useState('25')
  const [height, setHeight] = useState('178')
  const [weight, setWeight] = useState('72')
  const [activity, setActivity] = useState<Activity>('matig')
  const [sessions, setSessions] = useState('3')
  const [goal, setGoal] = useState<Goal>('onderhoud')
  const [plan, setPlan] = useState<NutritionPlan | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const make = (e: React.FormEvent) => {
    e.preventDefault()
    const a = Number(age), h = Number(height), w = Number(weight), s = Number(sessions)
    if (!(a >= 10 && a <= 100) || !(h >= 100 && h <= 220) || !(w >= 25 && w <= 250)) {
      setErr('Vul een geldige leeftijd (10–100), lengte (100–220 cm) en gewicht (25–250 kg) in.')
      setPlan(null)
      return
    }
    setErr(null)
    setPlan(buildNutritionPlan({ sex, age: a, heightCm: h, weightKg: w, activity, goal, sessionsPerWeek: Number.isFinite(s) ? s : 3 }))
  }

  const macroKcal = plan ? { p: plan.protein * 4, c: plan.carbs * 4, f: plan.fat * 9 } : null
  const macroTotal = macroKcal ? macroKcal.p + macroKcal.c + macroKcal.f || 1 : 1

  return (
    <div className="vd">
      <form className="vd-form" onSubmit={make}>
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
        <button type="submit" className="vd-go">🥗 Maak mijn voedingsplan</button>
        {err && <p className="vd-err">{err}</p>}
      </form>

      {plan && macroKcal && (
        <div className="vd-result">
          <div className="vd-hero">
            <span className="vd-hero-goal">{plan.goalLabel}</span>
            <span className="vd-hero-kcal">{plan.calories.toLocaleString('nl-BE')}</span>
            <span className="vd-hero-unit">kcal / dag (gemiddeld)</span>
            <span className="vd-hero-sub">basis {plan.bmr} · verbruik ±{plan.tdee} kcal · 💧 {(plan.hydrationMl / 1000).toFixed(1)} L water/dag</span>
            <span className="vd-hero-sub">BMI {plan.bmi.toString().replace('.', ',')} ({plan.bmiText}) · {changeText(plan.weeklyChangeKg)} · 🥄 {plan.proteinPerMeal} g eiwit per maaltijd</span>
          </div>

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

          <h3 className="vd-h3">🍳 Voorbeelddag op maat</h3>
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

          <h3 className="vd-h3">⚡ Sporttips</h3>
          <ul className="vd-tips">
            {plan.tips.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
