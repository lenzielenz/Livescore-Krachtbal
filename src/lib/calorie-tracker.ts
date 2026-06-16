// ── Calorie-tracker ────────────────────────────────────────────────────────────────────────────
// Pure logica voor de dagelijkse calorie-tracker: optellen, resterend, voortgang en de "zone"
// (te weinig / mooi op koers / erover) + een speels bemoedigend bericht. Los testbaar; de UI en
// opslag (localStorage per dag) zitten in het component.

export interface FoodEntry {
  id: string
  name: string
  kcal: number
  p: number // eiwit (g)
  c: number // koolhydraten (g)
  f: number // vet (g)
}
export interface Totals { kcal: number; p: number; c: number; f: number }
export type Zone = 'empty' | 'low' | 'good' | 'over'

export function sumEntries(entries: FoodEntry[]): Totals {
  return entries.reduce(
    (t, e) => ({ kcal: t.kcal + (e.kcal || 0), p: t.p + (e.p || 0), c: t.c + (e.c || 0), f: t.f + (e.f || 0) }),
    { kcal: 0, p: 0, c: 0, f: 0 },
  )
}

export function remaining(target: number, consumed: number): number {
  return Math.round(target - consumed)
}

/** Voortgang 0..1 voor de ring (geklemd zodat de ring nooit "overvol" tekent). */
export function ringFraction(target: number, consumed: number): number {
  if (target <= 0) return 0
  return Math.max(0, Math.min(1, consumed / target))
}

/** In welke zone zit de daginname t.o.v. het doel? */
export function zone(target: number, consumed: number): Zone {
  if (consumed <= 0) return 'empty'
  if (target <= 0) return 'good'
  const r = consumed / target
  if (r > 1.05) return 'over'
  if (r >= 0.9) return 'good'
  return 'low'
}

// ── Opslag (server of lokaal) ────────────────────────────────────────────────────────────────
export interface WeightEntry { d: string; kg: number }
export interface TrackerStore { days: Record<string, FoodEntry[]>; weights: WeightEntry[] }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const clampNum = (v: unknown, min: number, max: number): number => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : 0
}

/** Saneer een ruwe (DB/API) tracker-opslag: geldige datums/getallen, en begrensd in omvang. */
export function sanitizeTracker(raw: unknown): TrackerStore {
  const out: TrackerStore = { days: {}, weights: [] }
  if (!raw || typeof raw !== 'object') return out
  const r = raw as { days?: unknown; weights?: unknown }
  if (r.days && typeof r.days === 'object') {
    const keys = Object.keys(r.days as Record<string, unknown>)
      .filter((k) => DATE_RE.test(k))
      .sort()
      .slice(-60) // hou de recentste ~60 dagen
    for (const k of keys) {
      const arr = (r.days as Record<string, unknown>)[k]
      if (!Array.isArray(arr)) continue
      const entries = arr
        .slice(0, 80)
        .map((e): FoodEntry | null => {
          if (!e || typeof e !== 'object') return null
          const o = e as Record<string, unknown>
          const name = String(o.name ?? '').slice(0, 60)
          if (!name) return null
          return { id: String(o.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`), name, kcal: clampNum(o.kcal, 0, 9000), p: clampNum(o.p, 0, 999), c: clampNum(o.c, 0, 999), f: clampNum(o.f, 0, 999) }
        })
        .filter((x): x is FoodEntry => x !== null)
      if (entries.length) out.days[k] = entries
    }
  }
  if (Array.isArray(r.weights)) {
    out.weights = r.weights
      .map((w): WeightEntry | null => {
        if (!w || typeof w !== 'object') return null
        const o = w as Record<string, unknown>
        const d = String(o.d ?? '')
        const kg = Number(o.kg)
        if (!DATE_RE.test(d) || !Number.isFinite(kg) || kg < 20 || kg > 400) return null
        return { d, kg: Math.round(kg * 10) / 10 }
      })
      .filter((x): x is WeightEntry => x !== null)
      .sort((a, b) => a.d.localeCompare(b.d))
      .slice(-200)
  }
  return out
}

/** Aantal opeenvolgende dagen (vanaf vandaag terug) met minstens één gelogde hap. Vandaag mag leeg. */
export function streakFromDays(days: Record<string, FoodEntry[]>, today: Date = new Date()): number {
  const pad = (n: number) => String(n).padStart(2, '0')
  const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  let s = 0
  const d = new Date(today)
  for (let i = 0; i < 366; i++) {
    const has = (days[key(d)] ?? []).length > 0
    if (has) s++
    else if (i === 0) {
      // vandaag nog leeg → breekt de streak niet, maar telt niet mee
    } else break
    d.setDate(d.getDate() - 1)
  }
  return s
}

export interface WeightTrend { current: number | null; perWeek: number; etaDays: number | null }
/** Gewichtstrend via kleinste-kwadraten (kg/week) + geschatte dagen tot een streefgewicht. */
export function weightTrend(weights: WeightEntry[], targetKg?: number | null): WeightTrend {
  const pts = [...weights].sort((a, b) => a.d.localeCompare(b.d))
  if (pts.length === 0) return { current: null, perWeek: 0, etaDays: null }
  const current = pts[pts.length - 1].kg
  if (pts.length < 2) return { current, perWeek: 0, etaDays: null }
  const t0 = new Date(pts[0].d).getTime()
  const xs = pts.map((p) => (new Date(p.d).getTime() - t0) / 86_400_000) // dagen sinds eerste meting
  const ys = pts.map((p) => p.kg)
  const n = pts.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    den += (xs[i] - mx) ** 2
  }
  const slope = den === 0 ? 0 : num / den // kg/dag
  const perWeek = Math.round(slope * 7 * 10) / 10
  let etaDays: number | null = null
  if (targetKg != null && Number.isFinite(targetKg) && Math.abs(slope) > 1e-4) {
    const delta = targetKg - current
    if ((delta < 0 && slope < 0) || (delta > 0 && slope > 0)) etaDays = Math.ceil(delta / slope)
  }
  return { current, perWeek, etaDays }
}

/** Speels, bemoedigend bericht op basis van de zone + resterende calorieën. */
export function statusMessage(target: number, consumed: number): string {
  const z = zone(target, consumed)
  const left = remaining(target, consumed)
  if (z === 'empty') return 'Log je eerste hap van vandaag 🍎'
  if (z === 'low') return `Goed bezig! Nog ${left} kcal te gaan 💪`
  if (z === 'good') return left >= 0 ? `Mooi op koers — perfect in balans 🎯` : `Top getimed, precies goed 🎯`
  return `${Math.abs(left)} kcal over je doel — morgen weer 😅`
}
