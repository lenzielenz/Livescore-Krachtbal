import type { Payload } from 'payload'

import { competitionWhere } from './analyse-access'
import { buildMatchState } from './match-engine'
import { buildPredictionLeaderboard, type PredEntry } from './prediction-score'
import { prevWeekendDateIso } from './pronostiek-rad'
import { weekendRange } from './pronostiek-weekend'

export interface RadMatch {
  id: number
  home: string
  away: string
  dateIso: string | null
  bonus: number
}

export interface RadState {
  /** Maandag (ISO) van het weekend waarvoor het rad geldt (het komende speelweekend). */
  weekendStartIso: string
  /** Winnaar van vorig weekend (mag draaien), of null als er nog geen geschiedenis is. */
  winner: { userId: number; name: string } | null
  /** Geplande wedstrijden dit weekend die nog een bonus kunnen krijgen. */
  candidates: RadMatch[]
  /** Wedstrijden die al een bonus (×2) kregen — d.w.z. het rad is voor dit weekend al gedraaid. */
  boosted: RadMatch[]
  /** Is er al gedraaid voor dit weekend? */
  alreadySpun: boolean
}

const titleParts = (title: unknown): { home: string; away: string } => {
  const t = typeof title === 'string' ? title : ''
  const [home, away] = t.split(' — ')
  return { home: (home || 'Thuis').trim(), away: (away || 'Uit').trim() }
}

const toRadMatch = (m: Record<string, unknown>): RadMatch => {
  const { home, away } = titleParts(m.title)
  return {
    id: Number(m.id),
    home,
    away,
    dateIso: m.date ? String(m.date) : null,
    bonus: Number(m.pronostiekBonus) || 1,
  }
}

const isPlayable = (m: Record<string, unknown>) => !(m as { isDemo?: boolean }).isDemo && !(m as { analyseOnly?: boolean }).analyseOnly

/** Bepaal de winnaar van vorig weekend + de bonus-/kandidaatwedstrijden voor het komende weekend. */
export async function loadRadState(payload: Payload, now: Date = new Date()): Promise<RadState> {
  const current = weekendRange(now.toISOString())
  const last = weekendRange(prevWeekendDateIso(now))

  // 1) Winnaar van vorig weekend: scoor de afgehandelde wedstrijden in dat venster.
  const lastRes = await payload
    .find({
      collection: 'matches',
      where: { and: [{ status: { equals: 'finished' } }, { date: { greater_than_equal: last.startIso } }, { date: { less_than: last.endIso } }, competitionWhere()] },
      depth: 0,
      limit: 500,
    })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const lastWithPreds = (lastRes.docs as unknown as Record<string, unknown>[])
    .filter(isPlayable)
    .map((m) => ({
      id: Number(m.id),
      preds: Array.isArray((m as { scorePredictions?: unknown }).scorePredictions) ? (m as { scorePredictions: PredEntry[] }).scorePredictions : [],
      bonus: Number((m as { pronostiekBonus?: unknown }).pronostiekBonus) || 1,
    }))
    .filter((m) => m.preds.length > 0)
  const scored: { actual: { home: number; away: number }; preds: PredEntry[]; bonus: number }[] = []
  await Promise.all(
    lastWithPreds.map(async (m) => {
      const st = await buildMatchState(payload, m.id).catch(() => null)
      if (st) scored.push({ actual: { home: st.score.home, away: st.score.away }, preds: m.preds, bonus: m.bonus })
    }),
  )
  const board = buildPredictionLeaderboard(scored)
  const winner = board.length > 0 ? { userId: board[0].userId, name: board[0].name } : null

  // 2) Wedstrijden van het komende weekend.
  const curRes = await payload
    .find({
      collection: 'matches',
      where: { and: [{ date: { greater_than_equal: current.startIso } }, { date: { less_than: current.endIso } }, competitionWhere()] },
      depth: 0,
      limit: 500,
      sort: 'date',
    })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const playable = (curRes.docs as unknown as Record<string, unknown>[]).filter(isPlayable)
  const boosted = playable.filter((m) => (Number((m as { pronostiekBonus?: unknown }).pronostiekBonus) || 1) >= 2).map(toRadMatch)
  // Kandidaten = nog te spelen (gepland) en nog geen bonus.
  const candidates = playable
    .filter((m) => (m as { status?: string }).status === 'scheduled' && (Number((m as { pronostiekBonus?: unknown }).pronostiekBonus) || 1) < 2)
    .map(toRadMatch)

  return {
    weekendStartIso: current.startIso,
    winner,
    candidates,
    boosted,
    alreadySpun: boosted.length > 0,
  }
}
