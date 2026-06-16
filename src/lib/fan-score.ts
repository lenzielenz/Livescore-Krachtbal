// ── Fan-ranglijst (supporterscompetitie) ─────────────────────────────────────────────────────
// Eén seizoensscore per supporter, opgebouwd uit echte betrokkenheid: aanwezigheid (check-ins) en
// pronostiekpunten. Plus een fanbase-klassement (welke club heeft de actiefste supporters).
// Pure functies → los testbaar; de UI/queries zitten in de /fans-pagina.

export const FAN_POINTS = {
  /** Per bijgewoonde wedstrijd ("ik ben erbij"). Aanwezigheid weegt zwaar. */
  checkin: 10,
} as const

export interface FanInput {
  userId: number
  name: string
  clubId: number | null
  clubName: string | null
  checkins: number
  predictionPoints: number
}

export interface FanRow extends FanInput {
  score: number
}

/** Score van één supporter: aanwezigheid + pronostiekpunten. */
export function fanScore(checkins: number, predictionPoints: number): number {
  const c = Math.max(0, Math.floor(checkins))
  const p = Math.max(0, Math.floor(predictionPoints))
  return c * FAN_POINTS.checkin + p
}

/** Rangschik de supporters op score (meeste eerst). Supporters zonder enige activiteit vallen weg. */
export function buildFanLeaderboard(inputs: FanInput[]): FanRow[] {
  return inputs
    .map((i) => ({ ...i, score: fanScore(i.checkins, i.predictionPoints) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || b.checkins - a.checkins || a.name.localeCompare(b.name))
}

export interface FanClubRow {
  clubId: number
  clubName: string
  supporters: number
  score: number
  /** Gemiddelde score per supporter (1 decimaal). */
  average: number
}

/**
 * Fanbase-klassement: tel de supporterscores per club op ("welke club is het luidst?").
 * Supporters zonder club tellen niet mee in de clubrivaliteit.
 */
export function buildClubFanRanking(rows: FanRow[]): FanClubRow[] {
  const agg = new Map<number, { clubName: string; supporters: number; score: number }>()
  for (const r of rows) {
    if (r.clubId == null) continue
    const e = agg.get(r.clubId) ?? { clubName: r.clubName ?? '—', supporters: 0, score: 0 }
    e.supporters += 1
    e.score += r.score
    if (r.clubName) e.clubName = r.clubName
    agg.set(r.clubId, e)
  }
  return [...agg.entries()]
    .map(([clubId, e]) => ({
      clubId,
      clubName: e.clubName,
      supporters: e.supporters,
      score: e.score,
      average: e.supporters > 0 ? Math.round((e.score / e.supporters) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.score - a.score || b.average - a.average || a.clubName.localeCompare(b.clubName))
}
