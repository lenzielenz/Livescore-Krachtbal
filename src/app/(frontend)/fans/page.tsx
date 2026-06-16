import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { competitionWhere } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { sanitizeCheckins } from '@/lib/checkins'
import { buildClubFanRanking, buildFanLeaderboard, FAN_POINTS, type FanInput } from '@/lib/fan-score'
import { buildMatchState } from '@/lib/match-engine'
import { seasonMvpAwards, type MvpVoteRow } from '@/lib/mvp-vote'
import { getPayloadClient } from '@/lib/payload-client'
import { buildPredictionLeaderboard, type PredEntry } from '@/lib/prediction-score'
import { seasonFromDate } from '@/lib/seasons'
import './fans.css'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Supportersklassement — Krachtbal Live' }

const idOf = (v: unknown): number | null => {
  if (v == null) return null
  if (typeof v === 'object') return Number((v as { id?: unknown }).id)
  return Number(v)
}
const nameOf = (v: unknown): string | null => (v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '') || null : null)
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '★'
const MEDAL = ['🥇', '🥈', '🥉']

export default async function FansPage() {
  const payload = await getPayloadClient()
  const me = await getAuthUser()
  const myUserId = me ? Number((me as { id?: number }).id) : null
  const seizoen = seasonFromDate(new Date())

  // Alle wedstrijden van het seizoen (voor het filteren van check-ins op dit seizoen).
  const seasonMatchesRes = await payload
    .find({ collection: 'matches', where: { and: [{ seizoen: { equals: seizoen } }, competitionWhere()] }, depth: 0, limit: 5000 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const seasonMatchIds = new Set<number>(seasonMatchesRes.docs.map((m) => (m as { id: number }).id))

  // Pronostiekpunten per supporter (zelfde aanpak als de pronostiekstand).
  const withPreds = seasonMatchesRes.docs
    .filter((m) => (m as { status?: string }).status === 'finished' && !(m as { isDemo?: boolean }).isDemo && !(m as { analyseOnly?: boolean }).analyseOnly)
    .map((m) => ({ id: m.id as number, preds: Array.isArray((m as { scorePredictions?: unknown }).scorePredictions) ? (m as { scorePredictions: PredEntry[] }).scorePredictions : [] }))
    .filter((m) => m.preds.length > 0)
  const scored: { actual: { home: number; away: number }; preds: PredEntry[] }[] = []
  await Promise.all(
    withPreds.map(async (m) => {
      const st = await buildMatchState(payload, m.id).catch(() => null)
      if (st) scored.push({ actual: { home: st.score.home, away: st.score.away }, preds: m.preds })
    }),
  )
  const predPoints = new Map<number, number>()
  for (const row of buildPredictionLeaderboard(scored)) predPoints.set(row.userId, row.points)

  // Supporters: naam, club en check-ins (op dit seizoen) → fanscore.
  const usersRes = await payload
    .find({ collection: 'users', depth: 1, limit: 5000 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const inputs: FanInput[] = usersRes.docs.map((u) => {
    const checkins = sanitizeCheckins((u as { checkins?: unknown }).checkins).filter((c) => seasonMatchIds.has(c.m)).length
    return {
      userId: (u as { id: number }).id,
      name: String((u as { name?: unknown }).name ?? '') || 'Supporter',
      clubId: idOf((u as { club?: unknown }).club),
      clubName: nameOf((u as { club?: unknown }).club),
      checkins,
      predictionPoints: predPoints.get((u as { id: number }).id) ?? 0,
    }
  })

  const leaderboard = buildFanLeaderboard(inputs)
  const clubRanking = buildClubFanRanking(leaderboard)

  // Publiekslievelingen: hoe vaak werd een speler tot held van de match verkozen (afgelopen
  // wedstrijden van dit seizoen). De stem-documenten dragen al naam + rugnummer.
  const finishedIds = seasonMatchesRes.docs
    .filter((m) => (m as { status?: string }).status === 'finished' && !(m as { isDemo?: boolean }).isDemo && !(m as { analyseOnly?: boolean }).analyseOnly)
    .map((m) => (m as { id: number }).id)
  let mvpAwards: ReturnType<typeof seasonMvpAwards> = []
  if (finishedIds.length) {
    const votesRes = await payload
      .find({ collection: 'match-mvp-votes', where: { match: { in: finishedIds } }, depth: 0, limit: 100000, pagination: false })
      .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    const rows: MvpVoteRow[] = votesRes.docs.map((v) => {
      const sn = Number((v as { shirtNumber?: unknown }).shirtNumber)
      return {
        matchId: idOf((v as { match?: unknown }).match) ?? 0,
        playerId: idOf((v as { player?: unknown }).player) ?? 0,
        name: String((v as { playerName?: unknown }).playerName ?? '') || 'Speler',
        shirtNumber: Number.isFinite(sn) ? sn : null,
      }
    })
    mvpAwards = seasonMvpAwards(rows).slice(0, 8)
  }
  const myRank = myUserId != null ? leaderboard.findIndex((r) => r.userId === myUserId) : -1
  const top = leaderboard.slice(0, 25)

  return (
    <>
      <SiteHeader />
      <div className="site">
        <h1 className="page-title">📣 <span className="brand">Supportersklassement</span></h1>
        <p className="fan-intro">
          Seizoen {seizoen} — verdien punten door wedstrijden bij te wonen (<b>🙋 ik ben erbij</b>) en uitslagen te
          voorspellen. Hoe actiever je bent, hoe hoger je staat. <Link href="/hub" style={{ color: 'var(--accent)', fontWeight: 700 }}>Naar je hub →</Link>
        </p>

        {leaderboard.length === 0 ? (
          <section className="fan-card"><p className="fan-empty">Nog geen supporterspunten dit seizoen. <Link href="/">Woon een wedstrijd bij of voorspel een uitslag →</Link></p></section>
        ) : (
          <>
            {/* Fanbase-rivaliteit */}
            {clubRanking.length > 0 && (
              <section className="fan-card">
                <h2 className="fan-h2">🏟️ Luidste fanbase</h2>
                <div className="fan-clubs">
                  {clubRanking.slice(0, 6).map((c, i) => (
                    <Link key={c.clubId} href={`/clubs/${c.clubId}`} className={`fan-club${i === 0 ? ' is-top' : ''}`}>
                      <span className="fan-club-rank">{MEDAL[i] ?? i + 1}</span>
                      <span className="fan-club-name">{c.clubName}</span>
                      <span className="fan-club-meta">{c.supporters} supporter{c.supporters === 1 ? '' : 's'} · ⌀ {c.average}</span>
                      <span className="fan-club-score">{c.score}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Supporters-klassement */}
            <section className="fan-card">
              <h2 className="fan-h2">Top-supporters</h2>
              <ol className="fan-list">
                {top.map((r, i) => (
                  <li key={r.userId} className={`fan-row${r.userId === myUserId ? ' is-me' : ''}`}>
                    <span className="fan-rank">{MEDAL[i] ?? i + 1}</span>
                    <span className="fan-ava" aria-hidden>{initials(r.name)}</span>
                    <span className="fan-id">
                      <span className="fan-name">{r.name}{r.userId === myUserId ? ' (jij)' : ''}</span>
                      <span className="fan-sub">{r.clubName ?? 'Geen club'} · {r.checkins}× erbij{r.predictionPoints > 0 ? ` · ${r.predictionPoints} pronostiek` : ''}</span>
                    </span>
                    <span className="fan-score">{r.score}</span>
                  </li>
                ))}
              </ol>
              {myRank >= top.length && myUserId != null && (
                <div className="fan-myrank">
                  <span className="fan-rank">{myRank + 1}</span>
                  <span className="fan-ava" aria-hidden>{initials(leaderboard[myRank].name)}</span>
                  <span className="fan-id"><span className="fan-name">{leaderboard[myRank].name} (jij)</span><span className="fan-sub">{leaderboard[myRank].clubName ?? 'Geen club'} · {leaderboard[myRank].checkins}× erbij</span></span>
                  <span className="fan-score">{leaderboard[myRank].score}</span>
                </div>
              )}
            </section>
          </>
        )}

        {/* Publiekslievelingen: held van de match over het seizoen. */}
        {mvpAwards.length > 0 && (
          <section className="fan-card">
            <h2 className="fan-h2">🏆 Publiekslievelingen <span className="fan-h2-sub">held van de match · dit seizoen</span></h2>
            <ol className="fan-list">
              {mvpAwards.map((a, i) => (
                <li key={a.playerId} className="fan-row">
                  <span className="fan-rank">{MEDAL[i] ?? i + 1}</span>
                  <span className="fan-ava" aria-hidden>{a.shirtNumber != null ? a.shirtNumber : initials(a.name)}</span>
                  <span className="fan-id">
                    <span className="fan-name">{a.name}</span>
                    <span className="fan-sub">{a.wins}× held van de match · {a.votes} stem{a.votes === 1 ? '' : 'men'}</span>
                  </span>
                  <span className="fan-score">{a.wins > 0 ? `${a.wins}×` : a.votes}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <details className="fan-rules">
          <summary>Hoe verdien je punten?</summary>
          <ul>
            <li><b>{FAN_POINTS.checkin} punten</b> per wedstrijd die je bijwoont (🙋 ik ben erbij op de wedstrijdpagina)</li>
            <li><b>Je pronostiekpunten</b> tellen mee — voorspel uitslagen op een livewedstrijd</li>
            <li>De fanbase-stand telt alle supporterscores van een club samen</li>
          </ul>
        </details>
      </div>
    </>
  )
}
