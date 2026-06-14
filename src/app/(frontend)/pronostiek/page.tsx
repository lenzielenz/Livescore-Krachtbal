import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { competitionWhere } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { buildMatchState } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { buildPredictionLeaderboard, type PredEntry } from '@/lib/prediction-score'
import { LIVE_PRONOSTIEK_MAX_PER_WEEKEND } from '@/lib/pronostiek-weekend'
import { seasonFromDate } from '@/lib/seasons'
import '../club/voorspel/voorspel.css'

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
      bonus: Number((m as { pronostiekBonus?: unknown }).pronostiekBonus) || 1,
    }))
    .filter((m) => m.preds.length > 0)

  const scored: { actual: { home: number; away: number }; preds: PredEntry[]; bonus: number }[] = []
  await Promise.all(
    withPreds.map(async (m) => {
      const st = await buildMatchState(payload, m.id).catch(() => null)
      if (st) scored.push({ actual: { home: st.score.home, away: st.score.away }, preds: m.preds, bonus: m.bonus })
    }),
  )

  const leaderboard = buildPredictionLeaderboard(scored)
  const totalPlayers = leaderboard.length

  return (
    <>
      <SiteHeader active="stand" />
      <div className="site">
        <h1 className="page-title"><span className="brand">Pronostiekstand</span></h1>
        <p className="vs-intro">Seizoen {seizoen} · <Link href="/" style={{ color: 'var(--accent)' }}>voorspel mee op een livewedstrijd</Link> · <Link href="/pronostiek/rad" style={{ color: 'var(--accent)' }}>🎡 Bonusrad</Link>.</p>
        <details className="vs-rules">
          <summary>Hoe werken de punten?</summary>
          <ul>
            <li><strong>Exacte uitslag</strong>: 10 · juiste winnaar + doelsaldo: 6 · juiste winnaar: 4</li>
            <li><strong>Nabijheid</strong>: tot +4 (hoe dichter, hoe meer)</li>
            <li><strong>Dichtst bij</strong>: +3 per wedstrijd</li>
            <li>Hoe later tijdens de match je voorspelt, hoe <strong>minder</strong> je punten waard zijn</li>
            <li>Max. <strong>{LIVE_PRONOSTIEK_MAX_PER_WEEKEND}</strong> voorspellingen per weekend</li>
          </ul>
        </details>

        {leaderboard.length === 0 ? (
          <p className="empty">Nog geen punten — voorspel de uitslag op een wedstrijdpagina en kom later terug.</p>
        ) : (
          <>
            <p className="vs-locked" style={{ color: 'var(--dim)' }}>{totalPlayers} {totalPlayers === 1 ? 'deelnemer' : 'deelnemers'}</p>
            <div className="vs-board">
              {leaderboard.map((r, i) => (
                <div key={r.userId} className={`vs-row${r.userId === myUserId ? ' me' : ''}`}>
                  <span className="vs-rank">{i + 1}</span>
                  <span className="vs-who">{r.name}{r.userId === myUserId ? ' (jij)' : ''}</span>
                  <span className="vs-stat" title="Exacte uitslagen">🎯 {r.exact}</span>
                  <span className="vs-stat" title="Wedstrijden voorspeld">{r.predictions}×</span>
                  <span className="vs-pts">{r.points}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}
