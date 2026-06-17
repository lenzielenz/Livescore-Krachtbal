import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { competitionWhere } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { computeBadges, earnedCount } from '@/lib/badges'
import { sanitizeCheckins } from '@/lib/checkins'
import { buildFanLeaderboard, type FanInput } from '@/lib/fan-score'
import { buildMatchState } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { buildPredictionLeaderboard, type PredEntry } from '@/lib/prediction-score'
import { seasonFromDate } from '@/lib/seasons'
import { buildWrapped } from '@/lib/wrapped'
import './wrapped.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Mijn Krachtbal Wrapped — Krachtbal Live' }

const idOf = (v: unknown): number | null => {
  if (v == null) return null
  if (typeof v === 'object') return Number((v as { id?: unknown }).id)
  return Number(v)
}
const nameOf = (v: unknown): string | null => (v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '') || null : null)

export default async function WrappedPage() {
  const me = await getAuthUser()
  if (!me) {
    return (
      <>
        <SiteHeader />
        <div className="site">
          <h1 className="page-title">🎁 <span className="brand">Krachtbal Wrapped</span></h1>
          <section className="wb-card" style={{ maxWidth: 440 }}>
            <p className="wb-sub">Log in om je persoonlijke seizoensterugblik te zien.</p>
            <Link href="/inloggen" className="wb-btn wb-btn-primary">Inloggen →</Link>
          </section>
        </div>
      </>
    )
  }

  const payload = await getPayloadClient()
  const myUserId = Number((me as { id: number }).id)
  const season = seasonFromDate(new Date())

  // Alle wedstrijden van het seizoen (voor het filteren van check-ins + voorspellingen).
  const seasonMatchesRes = await payload
    .find({ collection: 'matches', where: { and: [{ seizoen: { equals: season } }, competitionWhere()] }, depth: 0, limit: 5000 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const seasonMatchIds = new Set<number>(seasonMatchesRes.docs.map((m) => (m as { id: number }).id))

  // Pronostiekklassement (voor mijn punten/exacte + de fanrang).
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
  const predBoard = buildPredictionLeaderboard(scored)
  const myPred = predBoard.find((r) => r.userId === myUserId)
  const predPoints = new Map<number, number>(predBoard.map((r) => [r.userId, r.points]))

  // Fanrang: zelfde fanscore-aanpak als /fans.
  const usersRes = await payload.find({ collection: 'users', depth: 1, limit: 5000 }).catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const fanInputs: FanInput[] = usersRes.docs.map((u) => ({
    userId: (u as { id: number }).id,
    name: String((u as { name?: unknown }).name ?? '') || 'Supporter',
    clubId: idOf((u as { club?: unknown }).club),
    clubName: nameOf((u as { club?: unknown }).club),
    checkins: sanitizeCheckins((u as { checkins?: unknown }).checkins).filter((c) => seasonMatchIds.has(c.m)).length,
    predictionPoints: predPoints.get((u as { id: number }).id) ?? 0,
  }))
  const fanBoard = buildFanLeaderboard(fanInputs)
  const fanRankIdx = fanBoard.findIndex((r) => r.userId === myUserId)

  // Mijn aanwezigheid + doelpunten gezien (dit seizoen).
  const myCheckins = sanitizeCheckins((me as { checkins?: unknown }).checkins)
  const attendedSeason = myCheckins.filter((c) => seasonMatchIds.has(c.m))
  const attendedFinished = seasonMatchesRes.docs.filter(
    (m) => attendedSeason.some((c) => c.m === (m as { id: number }).id) && (m as { status?: string }).status === 'finished',
  )
  let goalsSeen = 0
  await Promise.all(
    attendedFinished.map(async (m) => {
      const st = await buildMatchState(payload, (m as { id: number }).id).catch(() => null)
      if (st) goalsSeen += st.score.home + st.score.away
    }),
  )

  // Badges + uitgebrachte held-van-de-match-stemmen (dit seizoen).
  const photosRes = await payload.find({ collection: 'match-instants', where: { author: { equals: myUserId } }, limit: 1, depth: 0 }).catch(() => ({ totalDocs: 0 }))
  const u = me as unknown as Record<string, unknown>
  const booster = u.pronostiekPower as { mult?: unknown } | null | undefined
  const finishedSeasonIds = seasonMatchesRes.docs.filter((m) => (m as { status?: string }).status === 'finished').map((m) => (m as { id: number }).id)
  const myVotesRes = finishedSeasonIds.length
    ? await payload.find({ collection: 'match-mvp-votes', where: { and: [{ user: { equals: myUserId } }, { match: { in: finishedSeasonIds } }] }, limit: 1, depth: 0 }).catch(() => ({ totalDocs: 0 }))
    : { totalDocs: 0 }
  const mvpVotesCast = (myVotesRes as { totalDocs?: number }).totalDocs ?? 0
  // Pronostiek-deelnames: wedstrijden waarop ik een uitslag voorspelde.
  const myPredictions = seasonMatchesRes.docs.filter(
    (m) => Array.isArray((m as { scorePredictions?: unknown }).scorePredictions) &&
      (m as { scorePredictions: PredEntry[] }).scorePredictions.some((p) => Number(p?.userId) === myUserId),
  ).length
  const myFanScore = fanRankIdx >= 0 ? fanBoard[fanRankIdx].score : 0
  const badges = computeBadges({
    checkins: myCheckins.length,
    photos: (photosRes as { totalDocs?: number }).totalDocs ?? 0,
    predictions: myPredictions,
    predictionPoints: myPred?.points ?? 0,
    mvpVotes: mvpVotesCast,
    fanScore: myFanScore,
    profileComplete: Boolean(u.photo) && Boolean(u.club) && Boolean(u.position),
    boosterWon: Boolean(booster && booster.mult),
  })

  const wrapped = buildWrapped({
    season,
    matchesAttended: attendedSeason.length,
    goalsSeen,
    predictionPoints: myPred?.points ?? 0,
    exactPredictions: myPred?.exact ?? 0,
    badgesEarned: earnedCount(badges),
    mvpVotesCast,
    fanRank: fanRankIdx >= 0 ? fanRankIdx : null,
    fanTotal: fanBoard.length,
  })

  const myName = String((me as { name?: string }).name || 'Supporter')
  const empty = wrapped.matchesAttended === 0 && wrapped.predictionPoints === 0 && wrapped.badgesEarned <= 1

  return (
    <>
      <SiteHeader />
      <div className="site">
        <h1 className="page-title">🎁 <span className="brand">Krachtbal Wrapped</span></h1>

        <div className="wr-card">
          <div className="wr-glow" aria-hidden />
          <span className="wr-season">Seizoen {season}</span>
          <span className="wr-persona-emoji" aria-hidden>{wrapped.persona.emoji}</span>
          <span className="wr-persona-title">{wrapped.persona.title}</span>
          <span className="wr-name">{myName}</span>
          <p className="wr-blurb">{wrapped.persona.blurb}</p>

          <div className="wr-stats">
            <div className="wr-stat"><b>{wrapped.matchesAttended}</b><span>wedstrijden live</span></div>
            <div className="wr-stat"><b>{wrapped.goalsSeen}</b><span>doelpunten gezien</span></div>
            <div className="wr-stat"><b>{wrapped.predictionPoints}</b><span>pronostiekpunten</span></div>
            <div className="wr-stat"><b>{wrapped.badgesEarned}</b><span>badges</span></div>
            {wrapped.fanRank != null && <div className="wr-stat"><b>#{wrapped.fanRank + 1}</b><span>op {wrapped.fanTotal} supporters</span></div>}
            {wrapped.mvpVotesCast > 0 && <div className="wr-stat"><b>{wrapped.mvpVotesCast}</b><span>helden-stemmen</span></div>}
          </div>

          {wrapped.highlights.length > 0 && (
            <ul className="wr-highlights">
              {wrapped.highlights.map((h, i) => (
                <li key={i}><span aria-hidden>✦</span> {h}</li>
              ))}
            </ul>
          )}

          <span className="wr-foot">Krachtbal Live</span>
        </div>

        {empty ? (
          <p className="wr-empty">Je seizoen is nog maar net begonnen. Tik op een wedstrijd <b>🙋 Ik ben erbij</b> aan en voorspel een uitslag — dan vult je Wrapped zich vanzelf.</p>
        ) : (
          <p className="wr-share">📸 Maak een screenshot van je kaart en deel ze met je ploegmaats! · <Link href="/fans" style={{ color: 'var(--accent)', fontWeight: 700 }}>Supportersklassement →</Link></p>
        )}
      </div>
    </>
  )
}
