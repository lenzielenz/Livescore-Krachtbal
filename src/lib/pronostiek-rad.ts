// ── Bonusrad (Las Vegas-stijl) ────────────────────────────────────────────────────────────────
// De top 3 van de pronostiek van vórig weekend mogen elk DRIE KEER aan het rad draaien. Op het rad
// staan vermenigvuldigers in verschillend grote taartpunten (vaak = grote punt, zeldzaam = kleine).
// Elke draai levert één booster op; je krijgt er dus tot 3 (mogelijk verschillende). Ze zijn 4
// weken geldig en jij kiest zelf op welke wedstrijd je welke gebruikt. Pure helpers → los testbaar.

/**
 * Hoeveel deelnemers aan het rad mogen draaien, afhankelijk van de grootte van het deelnemersveld.
 * ~10% van de deelnemers (instelbaar via PRONOSTIEK_RAD_WINNER_PCT), met minstens 1 en nooit meer
 * dan er meedoen. Zo beloon je bij 4 deelnemers enkel de winnaar, en bij 100 ongeveer de top 10.
 */
export function radWinnerCount(participants: number): number {
  if (participants <= 0) return 0
  const pct = Number(process.env.PRONOSTIEK_RAD_WINNER_PCT) || 10
  const n = Math.round((participants * pct) / 100)
  return Math.max(1, Math.min(participants, n || 1))
}
/** Hoeveel keer je per speelweek mag draaien (= max. aantal boosters dat je wint). */
export const SPINS_PER_WEEK = 3
/** Hoeveel weken een gewonnen booster geldig blijft. */
export const TOKEN_WEEKS_VALID = 4

export type RadSegment = { mult: number; weight: number }

// De taartpunten op het rad. `weight` bepaalt zowel de GROOTTE van de punt als de KANS om erop te
// landen (zo komt het visuele overeen met de werkelijke kans). Vaak = groot, jackpot = klein.
export const RAD_SEGMENTS: RadSegment[] = [
  { mult: 2, weight: 6 },
  { mult: 3, weight: 4 },
  { mult: 1.5, weight: 7 },
  { mult: 5, weight: 2 },
  { mult: 2, weight: 6 },
  { mult: 10, weight: 1 },
  { mult: 3, weight: 4 },
  { mult: 1.5, weight: 7 },
]

export interface SegmentArc { mult: number; weight: number; start: number; end: number; mid: number }

/** Zet de segmenten om naar hoeken (graden, met de klok mee vanaf bovenaan) voor rad + animatie. */
export function segmentArcs(segs: RadSegment[] = RAD_SEGMENTS): SegmentArc[] {
  const total = segs.reduce((a, s) => a + s.weight, 0) || 1
  let acc = 0
  return segs.map((s) => {
    const ang = (s.weight / total) * 360
    const start = acc
    const end = acc + ang
    acc = end
    return { mult: s.mult, weight: s.weight, start, end, mid: (start + end) / 2 }
  })
}

/** Kies gewogen een segment-INDEX (zodat de animatie op het juiste vak kan landen). */
export function pickSegmentIndex(segs: RadSegment[] = RAD_SEGMENTS, rand: () => number = Math.random): number {
  const total = segs.reduce((a, s) => a + s.weight, 0) || 1
  let t = rand() * total
  for (let i = 0; i < segs.length; i++) {
    t -= segs[i].weight
    if (t < 0) return i
  }
  return segs.length - 1
}

/** ISO-datum van zeven dagen geleden — om het venster van "vorig weekend" te bepalen. */
export function prevWeekendDateIso(now: Date = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() - 7)
  return d.toISOString()
}

export type RadToken = { mult: number; wonAt: string; expiresAt: string }

/** Vervaldatum (ISO) van een booster: 4 weken na het winnen. */
export function tokenExpiry(wonAtIso: string): string {
  return new Date(new Date(wonAtIso).getTime() + TOKEN_WEEKS_VALID * 7 * 86_400_000).toISOString()
}

/** De nog geldige (niet-vervallen) boosters. */
export function activeTokens(tokens: RadToken[] | undefined | null, now: Date = new Date()): RadToken[] {
  if (!Array.isArray(tokens)) return []
  const t = now.getTime()
  return tokens.filter((tok) => tok && new Date(tok.expiresAt).getTime() > t)
}
