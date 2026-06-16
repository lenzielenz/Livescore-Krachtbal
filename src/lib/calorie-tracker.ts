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

/** Speels, bemoedigend bericht op basis van de zone + resterende calorieën. */
export function statusMessage(target: number, consumed: number): string {
  const z = zone(target, consumed)
  const left = remaining(target, consumed)
  if (z === 'empty') return 'Log je eerste hap van vandaag 🍎'
  if (z === 'low') return `Goed bezig! Nog ${left} kcal te gaan 💪`
  if (z === 'good') return left >= 0 ? `Mooi op koers — perfect in balans 🎯` : `Top getimed, precies goed 🎯`
  return `${Math.abs(left)} kcal over je doel — morgen weer 😅`
}
