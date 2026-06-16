'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import {
  remaining,
  ringFraction,
  sanitizeTracker,
  statusMessage,
  streakFromDays,
  sumEntries,
  weightTrend,
  zone,
  type FoodEntry,
  type TrackerStore,
} from '@/lib/calorie-tracker'
import { FoodSearch } from './FoodSearch'
import './calorie-tracker.css'

// Een speelse, "delightful" dagelijkse calorie-tracker bovenop het persoonlijke caloriedoel uit het
// voedingsplan: snel toevoegen (chips, zoeken/scannen), een vloeiende voortgangsring, macro-balkjes,
// een aanmoedigingsbericht, een streak, confetti én gewichtsopvolging met streefdatum. Ingelogd
// wordt alles in je account bewaard; anders lokaal.

type QuickFood = { emoji: string; name: string; kcal: number; p: number; c: number; f: number }
const QUICK_FOODS: QuickFood[] = [
  { emoji: '🍌', name: 'Banaan', kcal: 105, p: 1, c: 27, f: 0 },
  { emoji: '🥚', name: 'Ei', kcal: 78, p: 6, c: 1, f: 5 },
  { emoji: '🥛', name: 'Kwark (250 g)', kcal: 175, p: 25, c: 10, f: 1 },
  { emoji: '🍞', name: 'Boterham', kcal: 80, p: 3, c: 15, f: 1 },
  { emoji: '🍗', name: 'Kipfilet (100 g)', kcal: 165, p: 31, c: 0, f: 4 },
  { emoji: '🍚', name: 'Rijst (150 g)', kcal: 195, p: 4, c: 42, f: 0 },
  { emoji: '🥤', name: 'Eiwitshake', kcal: 160, p: 30, c: 5, f: 2 },
  { emoji: '🍎', name: 'Appel', kcal: 95, p: 0, c: 25, f: 0 },
  { emoji: '🥜', name: 'Handje noten', kcal: 180, p: 6, c: 6, f: 16 },
  { emoji: '🍝', name: 'Pasta (200 g)', kcal: 310, p: 11, c: 60, f: 2 },
  { emoji: '🥪', name: 'Broodje kip', kcal: 350, p: 25, c: 35, f: 12 },
  { emoji: '🍫', name: 'Reep chocolade', kcal: 230, p: 3, c: 25, f: 13 },
  { emoji: '🥗', name: 'Salade', kcal: 120, p: 4, c: 10, f: 7 },
  { emoji: '🍕', name: 'Pizzapunt', kcal: 285, p: 12, c: 36, f: 10 },
  { emoji: '☕', name: 'Koffie + melk', kcal: 30, p: 2, c: 3, f: 1 },
  { emoji: '🍺', name: 'Pintje', kcal: 150, p: 1, c: 13, f: 0 },
]

const pad = (n: number) => String(n).padStart(2, '0')
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const LOCAL_KEY = 'kbcal-store'
const fmtDate = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`

function useCountUp(target: number, ms = 600): number {
  const [n, setN] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    const start = from.current
    if (start === target || (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)) {
      from.current = target
      setN(target)
      return
    }
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      const eased = 1 - Math.pow(1 - k, 3)
      setN(Math.round(start + (target - start) * eased))
      if (k < 1) raf = requestAnimationFrame(tick)
      else from.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return n
}

export function CalorieTracker({
  calories,
  protein,
  carbs,
  fat,
  targetWeightKg,
  initialStore,
  canSave = false,
}: {
  calories: number
  protein: number
  carbs: number
  fat: number
  targetWeightKg?: number | null
  initialStore?: TrackerStore | null
  canSave?: boolean
}) {
  const [store, setStore] = useState<TrackerStore>(() => initialStore ?? { days: {}, weights: [] })
  const [confetti, setConfetti] = useState(0)
  const [name, setName] = useState('')
  const [kcal, setKcal] = useState('')
  const [weightInput, setWeightInput] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const wasGood = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Lokale opslag laden wanneer je niet ingelogd bewaart (ingelogd komt de opslag van de server).
  useEffect(() => {
    if (canSave) return
    try {
      const raw = localStorage.getItem(LOCAL_KEY)
      if (raw) setStore(sanitizeTracker(JSON.parse(raw)))
    } catch {
      /* geen lokale opslag */
    }
  }, [canSave])

  const persist = (next: TrackerStore) => {
    setStore(next)
    if (canSave) {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        fetch('/api/profile/calorie-tracker', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(next) }).catch(() => {})
      }, 800)
    } else {
      try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(next))
      } catch {
        /* opslag vol/geweigerd */
      }
    }
  }
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  const today = dayKey()
  const entries = store.days[today] ?? []

  const add = (f: { name: string; kcal: number; p?: number; c?: number; f?: number }) => {
    const entry: FoodEntry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: f.name, kcal: Math.round(f.kcal), p: Math.round(f.p ?? 0), c: Math.round(f.c ?? 0), f: Math.round(f.f ?? 0) }
    persist({ ...store, days: { ...store.days, [today]: [entry, ...entries] } })
  }
  const addQuick = (q: QuickFood) => add({ name: `${q.emoji} ${q.name}`, kcal: q.kcal, p: q.p, c: q.c, f: q.f })
  const addCustom = (e: React.FormEvent) => {
    e.preventDefault()
    const k = Number(kcal)
    if (!name.trim() || !Number.isFinite(k) || k <= 0) return
    add({ name: name.trim(), kcal: k })
    setName('')
    setKcal('')
  }
  const remove = (id: string) => persist({ ...store, days: { ...store.days, [today]: entries.filter((x) => x.id !== id) } })
  const resetDay = () => persist({ ...store, days: { ...store.days, [today]: [] } })

  const addWeight = (e: React.FormEvent) => {
    e.preventDefault()
    const kg = Number(weightInput.replace(',', '.'))
    if (!Number.isFinite(kg) || kg < 20 || kg > 400) return
    const others = store.weights.filter((w) => w.d !== today)
    const weights = [...others, { d: today, kg: Math.round(kg * 10) / 10 }].sort((a, b) => a.d.localeCompare(b.d))
    persist({ ...store, weights })
    setWeightInput('')
  }

  const totals = useMemo(() => sumEntries(entries), [entries])
  const left = remaining(calories, totals.kcal)
  const frac = ringFraction(calories, totals.kcal)
  const z = zone(calories, totals.kcal)
  const shownLeft = useCountUp(Math.abs(left))
  const streak = useMemo(() => streakFromDays(store.days), [store.days])
  const trend = useMemo(() => weightTrend(store.weights, targetWeightKg ?? null), [store.weights, targetWeightKg])
  const sparkW = store.weights.slice(-14)

  useEffect(() => {
    const good = z === 'good'
    if (good && !wasGood.current) setConfetti((n) => n + 1)
    wasGood.current = good
  }, [z])

  const R = 78
  const C = 2 * Math.PI * R
  const ZONE_COLOR: Record<string, string> = { empty: 'var(--accent, #06d6a0)', low: '#38bdf8', good: '#22c55e', over: '#f59e0b' }
  const color = ZONE_COLOR[z]

  const macros = [
    { key: 'p', label: 'Eiwit', val: totals.p, target: protein, col: '#f472b6' },
    { key: 'c', label: 'Koolh.', val: totals.c, target: carbs, col: '#38bdf8' },
    { key: 'f', label: 'Vet', val: totals.f, target: fat, col: '#fbbf24' },
  ]

  // Sparkline-pad voor de laatste gewichten.
  const spark = (() => {
    if (sparkW.length < 2) return null
    const kgs = sparkW.map((w) => w.kg)
    const min = Math.min(...kgs)
    const max = Math.max(...kgs)
    const span = max - min || 1
    const W = 120
    const H = 34
    const pts = sparkW.map((w, i) => {
      const x = (i / (sparkW.length - 1)) * W
      const y = H - ((w.kg - min) / span) * (H - 4) - 2
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    return { d: `M ${pts.join(' L ')}`, W, H }
  })()

  return (
    <section className="ct">
      <div className="ct-head">
        <h3 className="ct-title">🔥 Calorie-tracker <span className="ct-sub">vandaag</span></h3>
        {streak > 0 && <span className="ct-streak" title="Opeenvolgende dagen bijgehouden">🔥 {streak} {streak === 1 ? 'dag' : 'dagen'}</span>}
      </div>

      <div className="ct-top">
        <div className="ct-ring-wrap">
          <svg className="ct-ring" viewBox="0 0 180 180" role="img" aria-label={`${totals.kcal} van ${calories} kcal`}>
            <circle cx="90" cy="90" r={R} className="ct-ring-bg" />
            <circle cx="90" cy="90" r={R} className="ct-ring-fg" stroke={color} strokeDasharray={C} strokeDashoffset={C * (1 - frac)} transform="rotate(-90 90 90)" />
          </svg>
          <div className="ct-ring-center">
            <span className="ct-ring-num" style={{ color }}>{shownLeft}</span>
            <span className="ct-ring-lbl">{left >= 0 ? 'kcal te gaan' : 'kcal te veel'}</span>
            <span className="ct-ring-of">{totals.kcal} / {calories}</span>
          </div>
          {confetti > 0 && (
            <div key={confetti} className="ct-confetti" aria-hidden>
              {Array.from({ length: 14 }).map((_, i) => (
                <span key={i} style={{ ['--i' as string]: i }}>{['🎉', '✨', '🎊', '💪', '🥗'][i % 5]}</span>
              ))}
            </div>
          )}
        </div>

        <div className="ct-side">
          <p className={`ct-status ct-status-${z}`}>{statusMessage(calories, totals.kcal)}</p>
          <div className="ct-macros">
            {macros.map((m) => {
              const pct = m.target > 0 ? Math.min(100, Math.round((m.val / m.target) * 100)) : 0
              return (
                <div key={m.key} className="ct-macro">
                  <span className="ct-macro-top"><span>{m.label}</span><b>{Math.round(m.val)}<i> / {m.target}g</i></b></span>
                  <span className="ct-macro-bar"><span className="ct-macro-fill" style={{ width: `${pct}%`, background: m.col }} /></span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="ct-quick">
        {QUICK_FOODS.map((q) => (
          <button key={q.name} type="button" className="ct-chip" onClick={() => addQuick(q)} title={`${q.kcal} kcal · ${q.p}g eiwit`}>
            <span className="ct-chip-emoji" aria-hidden>{q.emoji}</span>
            <span className="ct-chip-name">{q.name}</span>
            <span className="ct-chip-kcal">{q.kcal}</span>
          </button>
        ))}
      </div>

      <button type="button" className="ct-search-btn" onClick={() => setShowSearch(true)}>
        🔎 Zoek voeding of 📷 scan een barcode
      </button>

      <form className="ct-custom" onSubmit={addCustom}>
        <input className="ct-input ct-input-name" type="text" placeholder="Eigen item…" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        <input className="ct-input ct-input-kcal" type="number" inputMode="numeric" placeholder="kcal" value={kcal} onChange={(e) => setKcal(e.target.value)} min={1} />
        <button type="submit" className="ct-add">+ Toevoegen</button>
      </form>

      {entries.length > 0 && (
        <ul className="ct-list">
          {entries.map((e) => (
            <li key={e.id} className="ct-item">
              <span className="ct-item-name">{e.name}</span>
              <span className="ct-item-kcal">{e.kcal} kcal</span>
              <button type="button" className="ct-item-del" onClick={() => remove(e.id)} aria-label={`${e.name} verwijderen`}>✕</button>
            </li>
          ))}
        </ul>
      )}

      <div className="ct-foot">
        <span>{entries.length} {entries.length === 1 ? 'item' : 'items'} vandaag{canSave ? ' · bewaard in je account' : ''}</span>
        {entries.length > 0 && <button type="button" className="ct-reset" onClick={resetDay}>Dag wissen</button>}
      </div>

      {/* Gewichtsopvolging met trend + streefdatum. */}
      <div className="ct-weight">
        <div className="ct-weight-head">
          <span className="ct-weight-title">⚖️ Gewicht</span>
          {trend.current != null && <span className="ct-weight-now">{trend.current} kg</span>}
        </div>
        <form className="ct-weight-form" onSubmit={addWeight}>
          <input className="ct-input" type="number" inputMode="decimal" step="0.1" placeholder="kg vandaag…" value={weightInput} onChange={(e) => setWeightInput(e.target.value)} />
          <button type="submit" className="ct-add">Opslaan</button>
        </form>
        {trend.current != null && (
          <div className="ct-weight-info">
            {spark && (
              <svg className="ct-spark" viewBox={`0 0 ${spark.W} ${spark.H}`} preserveAspectRatio="none" aria-hidden>
                <path d={spark.d} fill="none" stroke="var(--accent, #06d6a0)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              </svg>
            )}
            <div className="ct-weight-trend">
              {trend.perWeek !== 0 ? (
                <span>{trend.perWeek < 0 ? '↓' : '↑'} {Math.abs(trend.perWeek)} kg/week</span>
              ) : (
                <span>Nog geen trend</span>
              )}
              {targetWeightKg != null && trend.etaDays != null && (
                <span className="ct-weight-eta">🎯 {targetWeightKg} kg ± {fmtDate(new Date(Date.now() + trend.etaDays * 86_400_000))}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {showSearch && <FoodSearch onAdd={(f) => add(f)} onClose={() => setShowSearch(false)} />}
    </section>
  )
}
