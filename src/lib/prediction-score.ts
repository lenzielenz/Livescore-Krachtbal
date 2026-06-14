// ── Voorspelcompetitie (club-intern): puntensysteem + seizoensklassement ────────────────────
// Leden voorspellen de exacte eindstand van een clubwedstrijd. Na afloop verdien je punten naar
// hoe dicht je zat. Pure functies → los testbaar; de UI/loader rendert enkel het resultaat.

export interface ScoreGuess {
  home: number
  away: number
}

export interface PredEntry {
  userId: number
  name: string
  clubId: number | null
  home: number
  away: number
  at?: number
  /** Puntweging 0..1: vroeg voorspeld = 1; hoe verder in de match, hoe lager (bodem ~0,1). */
  weight?: number
}

export interface ScoredPred extends PredEntry {
  points: number
  exact: boolean
  resultOk: boolean
  diffOk: boolean
  /** Totale afwijking: |thuis−voorspeld| + |uit−voorspeld|. */
  error: number
  /** Eén van de dichtste voorspellingen voor deze wedstrijd (binnen de groep). */
  closest: boolean
}

// Puntwaarden. Basis is oplopend en niet-cumulatief; nabijheid en de dichtste-bonus komen erbij.
// Gekozen voor een MOOIE BALANS (skill > geluk) bij een groot deelnemersveld:
//  - 'exact' (10) blijft het wow-moment, maar de spreiding is bewust krap gehouden;
//  - 'result' (3) ligt lager dan 'resultAndDiff' (6) zodat precisie (juist doelsaldo) echt beloond wordt;
//  - 'closest' (2) is kleiner: de dichtste-bij-bonus is deels geluk en mag niet doorwegen.
// Max per wedstrijd = 10 + 3 + 2 = 15 (zie MAX_POINTS_PER_MATCH). Een krappere spreiding houdt de kloof
// klein → wie later instapt of een mindere dag heeft, blijft in de running voor de eerste plaats.
export const PRED_POINTS = { exact: 10, resultAndDiff: 6, result: 3, nearMax: 3, closest: 2 } as const

/** Maximaal haalbaar in één wedstrijd (exact + volle nabijheid + dichtste-bij). */
export const MAX_POINTS_PER_MATCH = PRED_POINTS.exact + PRED_POINTS.nearMax + PRED_POINTS.closest

/**
 * Hoeveel "sterke weekends" een achterstand ongeveer kost om in te halen. Met de weekendlimiet
 * (max. N voorspellingen/weekend) is de winst per weekend begrensd → een achterstand snoept je in
 * een handvol goeie weekends weg. `swingPerWeekend` = realistische voorsprong die je per weekend op
 * een rivaal kan pakken (lager dan het absolute maximum, want iedereen scoort doorgaans behoorlijk).
 */
export function catchUpWeekends(deficit: number, swingPerWeekend: number): number {
  if (deficit <= 0) return 0
  const swing = swingPerWeekend > 0 ? swingPerWeekend : 1
  return Math.max(1, Math.ceil(deficit / swing))
}

const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0)

/** Basispunten + de losse vlaggen, voor één voorspelling tegenover de eindstand. */
export function basePoints(actual: ScoreGuess, pred: ScoreGuess): { base: number; exact: boolean; resultOk: boolean; diffOk: boolean } {
  const exact = actual.home === pred.home && actual.away === pred.away
  const resultOk = sign(actual.home - actual.away) === sign(pred.home - pred.away)
  const diffOk = actual.home - actual.away === pred.home - pred.away
  let base = 0
  if (exact) base = PRED_POINTS.exact
  else if (resultOk && diffOk) base = PRED_POINTS.resultAndDiff
  else if (resultOk) base = PRED_POINTS.result
  return { base, exact, resultOk, diffOk }
}

/**
 * Scoor alle voorspellingen van één wedstrijd: basis + nabijheid + dichtste-bij-bonus.
 * `matchBonus` is de puntenmultiplier van de wedstrijd zelf (bonusrad): 1 = normaal, 2 = bonus.
 */
export function scoreMatchPredictions(actual: ScoreGuess, preds: PredEntry[], matchBonus = 1): ScoredPred[] {
  if (preds.length === 0) return []
  const bonus = Number.isFinite(matchBonus) && matchBonus > 0 ? matchBonus : 1
  const rows = preds.map((p) => {
    const { base, exact, resultOk, diffOk } = basePoints(actual, p)
    const error = Math.abs(actual.home - p.home) + Math.abs(actual.away - p.away)
    const near = Math.max(0, PRED_POINTS.nearMax - error)
    return { p, base, near, exact, resultOk, diffOk, error }
  })
  const minErr = Math.min(...rows.map((r) => r.error))
  return rows.map((r) => {
    const closest = r.error === minErr
    const raw = r.base + r.near + (closest ? PRED_POINTS.closest : 0)
    const weight = typeof r.p.weight === 'number' ? Math.max(0, Math.min(1, r.p.weight)) : 1
    return {
      ...r.p,
      exact: r.exact,
      resultOk: r.resultOk,
      diffOk: r.diffOk,
      error: r.error,
      closest,
      points: Math.round(raw * weight * bonus),
    }
  })
}

export interface LeaderRow {
  userId: number
  name: string
  points: number
  predictions: number
  exact: number
  closest: number
}

/**
 * Bouw een seizoensklassement: scoor de (reeds tot de juiste groep gefilterde) voorspellingen over
 * alle afgehandelde wedstrijden en tel de punten per persoon op. De "dichtste" wordt per wedstrijd
 * binnen de meegegeven groep bepaald — zo werkt zowel het clubklassement als een privé-pool.
 */
export function buildPredictionLeaderboard(matches: { actual: ScoreGuess; preds: PredEntry[]; bonus?: number }[]): LeaderRow[] {
  const agg = new Map<number, LeaderRow>()
  for (const m of matches) {
    const scored = scoreMatchPredictions(m.actual, m.preds, m.bonus ?? 1)
    for (const s of scored) {
      let r = agg.get(s.userId)
      if (!r) {
        r = { userId: s.userId, name: s.name, points: 0, predictions: 0, exact: 0, closest: 0 }
        agg.set(s.userId, r)
      }
      r.points += s.points
      r.predictions += 1
      if (s.exact) r.exact += 1
      if (s.closest) r.closest += 1
      r.name = s.name // meest recente naam
    }
  }
  return [...agg.values()].sort((a, b) => b.points - a.points || b.exact - a.exact || a.predictions - b.predictions)
}
