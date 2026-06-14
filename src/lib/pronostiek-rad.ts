// ── Bonusrad (Las Vegas-stijl) ────────────────────────────────────────────────────────────────
// De top 3 van de pronostiek van vórig weekend mogen elk aan het rad draaien. Op het rad staan
// VERMENIGVULDIGERS. Wat je draait, win je als persoonlijke booster: je krijgt 3 stuks die je de
// week erop zelf op je voorspellingen kan plakken (jij kiest welke wedstrijd). Pure helpers → los
// testbaar; de server (API/loader) doet de payload-kant.

/** Hoeveel deelnemers (de top N van het weekend) aan het rad mogen draaien. */
export const RAD_TOP_N = 3
/** Hoeveel boosters je wint per keer draaien (te gebruiken op je volgende voorspellingen). */
export const TOKENS_PER_WIN = 3

// De segmenten op het rad (visuele volgorde). Dezelfde waarde mag meermaals voorkomen.
export const RAD_SEGMENTS = [2, 3, 1.5, 5, 2, 10, 3, 1.5] as const

/** ISO-datum van zeven dagen geleden — om het venster van "vorig weekend" te bepalen. */
export function prevWeekendDateIso(now: Date = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() - 7)
  return d.toISOString()
}

// Gewichten voor de (gezaghebbende) trekking: zeldzamer = grotere vermenigvuldiger.
const RAD_WEIGHTS: Record<number, number> = { 1.5: 30, 2: 30, 3: 22, 5: 12, 10: 6 }

/** Trek gewogen een vermenigvuldiger die ook écht op het rad staat (zodat de animatie kan landen). */
export function pickMultiplier(rand: () => number = Math.random): number {
  const values = [...new Set(RAD_SEGMENTS as readonly number[])]
  const total = values.reduce((a, v) => a + (RAD_WEIGHTS[v] ?? 1), 0)
  let t = rand() * total
  for (const v of values) {
    t -= RAD_WEIGHTS[v] ?? 1
    if (t < 0) return v
  }
  return values[0]
}
