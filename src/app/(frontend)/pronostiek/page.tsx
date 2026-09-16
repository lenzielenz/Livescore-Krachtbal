import Link from 'next/link'

import { isFederationLevel } from '@/lib/access'
import { SiteHeader } from '@/components/SiteHeader'
import { competitionWhere } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { buildMatchState } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { buildPredictionLeaderboard, MAX_POINTS_PER_MATCH, PRED_POINTS, type PredEntry } from '@/lib/prediction-score'
import { activeTokens, radWinnerCount, SPINS_PER_WEEK, type RadToken } from '@/lib/pronostiek-rad'
import { loadRadState } from '@/lib/pronostiek-rad-server'
import { LIVE_PRONOSTIEK_MAX_PER_WEEKEND } from '@/lib/pronostiek-weekend'
import { seasonFromDate } from '@/lib/seasons'
import { PronostiekBoard } from './PronostiekBoard'
import { RadTeaser } from './RadTeaser'
import '../club/voorspel/voorspel.css'
import './pronostiek.css'

export const dynamic = 'force-dynamic'

// Globale pronostiekstand van de livescore: iedereen die op de matchpagina's de uitslag voorspelt,
// samen in één klassement over het seizoen. (Apart van de club-pronostiek onder "Mijn club".)
export default async function PronostiekStandPage() {
  const payload = await getPayloadClient()
  const me = await getAuthUser()
  const myUserId = me ? Number((me as { id?: number }).id) : null

  const seizoen = seasonFromDate(new Date())
  const matchesRes = await payload
    .find({
      collection: 'matches',
      where: { and: [{ status: { equals: 'finished' } }, { seizoen: { equals: seizoen } }, competitionWhere()] },
      depth: 0,
      limit: 2000,
    })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))

  // Enkel afgehandelde wedstrijden met voorspellingen tellen mee.
  const withPreds = matchesRes.docs
    .filter((m) => !(m as { isDemo?: boolean }).isDemo && !(m as { analyseOnly?: boolean }).analyseOnly)
    .map((m) => ({
      id: m.id as number,
      preds: Array.isArray((m as { scorePredictions?: unknown }).scorePredictions) ? (m as { scorePredictions: PredEntry[] }).scorePredictions : [],
    }))
    .filter((m) => m.preds.length > 0)

  // De bonusrad-booster zit per voorspelling (PredEntry.mult); het klassement past die automatisch toe.
  const scored: { actual: { home: number; away: number }; preds: PredEntry[] }[] = []
  await Promise.all(
    withPreds.map(async (m) => {
      const st = await buildMatchState(payload, m.id).catch(() => null)
      if (st) scored.push({ actual: { home: st.score.home, away: st.score.away }, preds: m.preds })
    }),
  )

  const leaderboard = buildPredictionLeaderboard(scored)
  const totalPlayers = leaderboard.length

  // Status voor de bonusrad-teaser — zelfde logica als /pronostiek/rad, zodat de kaart hier al toont
  // of je mag draaien, boosters klaar hebt liggen, of nog moet knokken voor de top.
  const canTest = isFederationLevel(me)
  const radState = await loadRadState(payload)
  type Power = { tokens?: RadToken[]; spinWeek?: string; spinsUsed?: number }
  const power = ((me as { pronostiekPower?: Power | null } | null)?.pronostiekPower ?? {}) as Power
  const heldTokensCount = activeTokens(power.tokens).length
  const myRank = radState.winners.find((w) => w.userId === myUserId)?.rank ?? null
  const eligible = canTest || myRank != null
  const usedThisWeek = power.spinWeek === radState.weekendStartIso ? Number(power.spinsUsed) || 0 : 0
  const spinsLeft = canTest ? 99 : eligible ? Math.max(0, SPINS_PER_WEEK - usedThisWeek) : 0
  const winnerCount = radWinnerCount(radState.participants)

  return (
    <>
      <SiteHeader active="stand" />
      <div className="site">
        <h1 className="page-title"><span className="brand">Pronostiekstand</span></h1>
        <RadTeaser
          loggedIn={Boolean(me)}
          eligible={eligible}
          spinsLeft={spinsLeft}
          heldTokensCount={heldTokensCount}
          winnerCount={winnerCount}
        />
        <p className="vs-intro">Seizoen {seizoen} · <Link href="/" style={{ color: 'var(--accent)' }}>voorspel mee op een livewedstrijd</Link>.</p>
        <details className="vs-rules">
          <summary>Hoe werken de punten?</summary>
          <ul>
            <li><strong>Exacte uitslag</strong>: {PRED_POINTS.exact} · juiste winnaar + doelsaldo: {PRED_POINTS.resultAndDiff} · juiste winnaar: {PRED_POINTS.result}</li>
            <li><strong>Nabijheid</strong>: tot +{PRED_POINTS.nearMax} (hoe dichter, hoe meer) · <strong>dichtst bij</strong>: +{PRED_POINTS.closest}</li>
            <li>Max. <strong>{MAX_POINTS_PER_MATCH}</strong> punten per wedstrijd</li>
            <li>Hoe later tijdens de match je voorspelt, hoe <strong>minder</strong> je punten waard zijn</li>
            <li>Max. <strong>{LIVE_PRONOSTIEK_MAX_PER_WEEKEND}</strong> voorspellingen per weekend — élke <strong>maandag 08:00</strong> kan je opnieuw voorspellen</li>
          </ul>
        </details>

        {leaderboard.length === 0 ? (
          <p className="empty">Nog geen punten — voorspel de uitslag op een wedstrijdpagina en kom later terug.</p>
        ) : (
          <PronostiekBoard
            rows={leaderboard}
            myUserId={myUserId}
            swingPerWeekend={LIVE_PRONOSTIEK_MAX_PER_WEEKEND * 5}
            totalPlayers={totalPlayers}
          />
        )}
      </div>
    </>
  )
}
