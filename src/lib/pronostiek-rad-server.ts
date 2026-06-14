import type { Payload } from 'payload'

import { competitionWhere } from './analyse-access'
import { buildMatchState } from './match-engine'
import { buildPredictionLeaderboard, type PredEntry } from './prediction-score'
import { prevWeekendDateIso } from './pronostiek-rad'
import { weekendRange } from './pronostiek-weekend'

export interface RadWinner {
  userId: number
  name: string
  rank: number
}

export interface RadState {
  /** Maandag (ISO) van het weekend waarvoor het rad/de boosters gelden (de huidige speelweek). */
  weekendStartIso: string
  /** De top 3 van vorig weekend — zij mogen draaien. Leeg als er nog geen geschiedenis is. */
  top3: RadWinner[]
}

const isPlayable = (m: Record<string, unknown>) => !(m as { isDemo?: boolean }).isDemo && !(m as { analyseOnly?: boolean }).analyseOnly

/** Bepaal de top 3 van vorig weekend (zij mogen aan het rad) + de huidige speelweek-sleutel. */
export async function loadRadState(payload: Payload, now: Date = new Date()): Promise<RadState> {
  const current = weekendRange(now.toISOString())
  const last = weekendRange(prevWeekendDateIso(now))

  const lastRes = await payload
    .find({
      collection: 'matches',
      where: { and: [{ status: { equals: 'finished' } }, { date: { greater_than_equal: last.startIso } }, { date: { less_than: last.endIso } }, competitionWhere()] },
      depth: 0,
      limit: 500,
    })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const withPreds = (lastRes.docs as unknown as Record<string, unknown>[])
    .filter(isPlayable)
    .map((m) => ({
      id: Number(m.id),
      preds: Array.isArray((m as { scorePredictions?: unknown }).scorePredictions) ? (m as { scorePredictions: PredEntry[] }).scorePredictions : [],
    }))
    .filter((m) => m.preds.length > 0)
  const scored: { actual: { home: number; away: number }; preds: PredEntry[] }[] = []
  await Promise.all(
    withPreds.map(async (m) => {
      const st = await buildMatchState(payload, m.id).catch(() => null)
      if (st) scored.push({ actual: { home: st.score.home, away: st.score.away }, preds: m.preds })
    }),
  )
  const board = buildPredictionLeaderboard(scored)
  const top3: RadWinner[] = board.slice(0, 3).map((r, i) => ({ userId: r.userId, name: r.name, rank: i + 1 }))

  return { weekendStartIso: current.startIso, top3 }
}
