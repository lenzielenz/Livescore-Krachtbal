import Link from 'next/link'

import { isFederationLevel } from '@/lib/access'
import { SiteHeader } from '@/components/SiteHeader'
import { competitionWhere } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { buildMatchState } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { buildPredictionLeaderboard, MAX_POINTS_PER_MATCH, PRED_POINTS, type PredEntry } from '@/lib/prediction-score'
import { activeTokens, RAD_SEGMENTS, radWinnerCount, SPINS_PER_WEEK, TOKEN_WEEKS_VALID, type RadToken } from '@/lib/pronostiek-rad'
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

  // Profielfoto's voor de avatars in de stand — wie er geen heeft, valt terug op initialen (zie
  // components/Avatar.tsx). Eén bulk-find i.p.v. één query per rij.
  const userIds = leaderboard.map((r) => r.userId)
  const photosRes = userIds.length
    ? await payload
        .find({ collection: 'users', where: { id: { in: userIds } }, depth: 1, limit: userIds.length })
        .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    : { docs: [] as Record<string, unknown>[] }
  const photoByUserId: Record<number, string | null> = {}
  for (const u of photosRes.docs) {
    const photo = (u as { photo?: unknown }).photo
    const url = photo && typeof photo === 'object' ? (photo as { url?: unknown }).url : null
    photoByUserId[Number((u as { id: number }).id)] = typeof url === 'string' ? url : null
  }

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
  // Unieke vermenigvuldigers op het rad (RAD_SEGMENTS herhaalt de vaakst voorkomende voor de
  // taartpunt-grootte — voor de uitleg tonen we elke waarde maar één keer).
  const radMultipliers = [...new Set(RAD_SEGMENTS.map((s) => s.mult))].sort((a, b) => a - b)
  const radJackpot = Math.max(...radMultipliers)
  const winnerUserIds = new Set(radState.winners.map((w) => w.userId))

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
          <summary>Hoe werken de punten & het bonusrad?</summary>
          <ul>
            <li><strong>Exacte uitslag</strong>: {PRED_POINTS.exact} · juiste winnaar + doelsaldo: {PRED_POINTS.resultAndDiff} · juiste winnaar: {PRED_POINTS.result}</li>
            <li><strong>Nabijheid</strong>: tot +{PRED_POINTS.nearMax} (hoe dichter, hoe meer) · <strong>dichtst bij</strong>: +{PRED_POINTS.closest}</li>
            <li>Max. <strong>{MAX_POINTS_PER_MATCH}</strong> punten per wedstrijd</li>
            <li>Hoe later tijdens de match je voorspelt, hoe <strong>minder</strong> je punten waard zijn</li>
            <li>Max. <strong>{LIVE_PRONOSTIEK_MAX_PER_WEEKEND}</strong> voorspellingen per weekend — élke <strong>maandag 08:00</strong> kan je opnieuw voorspellen</li>
          </ul>
          {/* Zelfde uitleg-blok als de punten hierboven, want de teaser-kaart bovenaan roept wel op
              om te draaien maar zegt nergens WANNEER dat mag of wat je ermee doet — dat stond enkel
              (deels) op /pronostiek/rad zelf. */}
          <div className="vs-rad-explain">
            <p className="vs-rad-lead">
              🎡 Elk weekend mogen de <strong>{winnerCount}</strong> beste voorspellers van het weekend ervoor aan het bonusrad draaien.
            </p>
            <ol className="vs-rad-steps">
              <li>Verzamel punten zoals hierboven — hoe hoger je eindigt in het weekendklassement, hoe groter je kans om bij de top {winnerCount} te horen.</li>
              <li>Sta je erbij? Dan krijg je <strong>{SPINS_PER_WEEK} gratis draaien</strong>, elke <strong>maandag 08:00</strong> weer opnieuw.</li>
              <li>Elke draai levert een <strong>vermenigvuldiger</strong> op die je zelf kiest op een toekomstige voorspelling — geldig <strong>{TOKEN_WEEKS_VALID} weken</strong>.</li>
            </ol>
            <div className="vs-rad-prizes">
              {radMultipliers.map((m) => (
                <span key={m} className={`vs-rad-chip${m === radJackpot ? ' jackpot' : ''}`}>
                  {m === radJackpot ? '🎰 ' : ''}×{m}{m === radJackpot ? ' Jackpot' : ''}
                </span>
              ))}
            </div>
          </div>
        </details>

        {leaderboard.length === 0 ? (
          <p className="empty">Nog geen punten — voorspel de uitslag op een wedstrijdpagina en kom later terug.</p>
        ) : (
          <PronostiekBoard
            rows={leaderboard}
            myUserId={myUserId}
            swingPerWeekend={LIVE_PRONOSTIEK_MAX_PER_WEEKEND * 5}
            totalPlayers={totalPlayers}
            winnerUserIds={winnerUserIds}
            photoByUserId={photoByUserId}
          />
        )}
      </div>
    </>
  )
}
