import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { competitionWhere } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { computeBadges, earnedCount, type Badge, type BadgeStats } from '@/lib/badges'
import { sanitizeCheckins } from '@/lib/checkins'
import { fanScore } from '@/lib/fan-score'
import { buildMatchState } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { buildPredictionLeaderboard, type PredEntry } from '@/lib/prediction-score'
import { seasonFromDate } from '@/lib/seasons'
import './badges.css'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Mijn badges — Krachtbal Live' }

export default async function BadgesPage() {
  const authUser = await getAuthUser()
  if (!authUser) {
    return (
      <>
        <SiteHeader />
        <div className="site">
          <h1 className="page-title">🏅 <span className="brand">Mijn badges</span></h1>
          <section className="wb-card" style={{ maxWidth: 440 }}>
            <p className="wb-sub">Log in om je badges te verzamelen.</p>
            <Link href="/inloggen" className="wb-btn wb-btn-primary">Inloggen →</Link>
          </section>
        </div>
      </>
    )
  }

  const payload = await getPayloadClient()
  const myUserId = (authUser as { id: number }).id
  const me = (await payload
    .findByID({ collection: 'users', id: myUserId, depth: 1 })
    .catch(() => null)) as unknown as Record<string, unknown> | null
  const u = me ?? (authUser as unknown as Record<string, unknown>)

  // Aantal geplaatste tribunefoto's + uitgebrachte held-van-de-match-stemmen (eigen documenten).
  const [photosRes, votesRes] = await Promise.all([
    payload.find({ collection: 'match-instants', where: { author: { equals: myUserId } }, limit: 1, depth: 0 }).catch(() => ({ totalDocs: 0 })),
    payload.find({ collection: 'match-mvp-votes', where: { user: { equals: myUserId } }, limit: 1, depth: 0 }).catch(() => ({ totalDocs: 0 })),
  ])
  const photos = (photosRes as { totalDocs?: number }).totalDocs ?? 0
  const mvpVotes = (votesRes as { totalDocs?: number }).totalDocs ?? 0

  // Pronostiek (deelnames + punten) over dit seizoen.
  const season = seasonFromDate(new Date())
  const seasonMatchesRes = await payload
    .find({ collection: 'matches', where: { and: [{ seizoen: { equals: season } }, competitionWhere()] }, depth: 0, limit: 5000 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const myPredictions = seasonMatchesRes.docs.filter(
    (m) => Array.isArray((m as { scorePredictions?: unknown }).scorePredictions) &&
      (m as { scorePredictions: PredEntry[] }).scorePredictions.some((p) => Number(p?.userId) === myUserId),
  ).length
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
  const myPred = buildPredictionLeaderboard(scored).find((r) => r.userId === myUserId)
  const predictionPoints = myPred?.points ?? 0

  const checkins = sanitizeCheckins(u.checkins).length
  const booster = u.pronostiekPower as { mult?: unknown } | null | undefined
  const stats: BadgeStats = {
    checkins,
    photos,
    predictions: myPredictions,
    predictionPoints,
    mvpVotes,
    fanScore: fanScore(checkins, predictionPoints),
    profileComplete: Boolean(u.photo) && Boolean(u.club) && Boolean(u.position),
    boosterWon: Boolean(booster && booster.mult),
  }

  const badges = computeBadges(stats)
  const earned = earnedCount(badges)
  const total = badges.length

  // Groepeer op categorie, in de volgorde waarin ze voorkomen.
  const groups: { name: string; items: Badge[] }[] = []
  for (const b of badges) {
    let g = groups.find((x) => x.name === b.group)
    if (!g) { g = { name: b.group, items: [] }; groups.push(g) }
    g.items.push(b)
  }

  return (
    <>
      <SiteHeader />
      <div className="site">
        <h1 className="page-title">🏅 <span className="brand">Mijn badges</span></h1>
        <p className="wb-intro">
          Verzamel badges door wedstrijden bij te wonen, sfeerfoto’s te plaatsen, uitslagen te voorspellen,
          te stemmen voor de held van de match en je profiel compleet te maken.
          {' '}<Link href="/profiel/paspoort" style={{ color: 'var(--accent)', fontWeight: 700 }}>Supporterpaspoort →</Link>
        </p>

        <div className="bg-progress">
          <div className="bg-progress-top">
            <span className="bg-progress-count">{earned}<i>/{total}</i></span>
            <span className="bg-progress-lbl">badges verdiend</span>
          </div>
          <div className="bg-bar"><span style={{ width: `${Math.round((earned / total) * 100)}%` }} /></div>
        </div>

        {groups.map((g) => (
          <section key={g.name} className="bg-group">
            <h2 className="bg-group-title">{g.name}</h2>
            <div className="bg-grid">
              {g.items.map((b) => (
                <div key={b.key} className={`bg-card${b.earned ? ' is-earned' : ''}`}>
                  <span className="bg-emoji" aria-hidden>{b.emoji}</span>
                  <span className="bg-title">{b.title}</span>
                  <span className="bg-desc">{b.desc}</span>
                  {b.earned ? (
                    <span className="bg-state bg-state-on">✓ Verdiend</span>
                  ) : b.progress ? (
                    <span className="bg-prog">
                      <span className="bg-prog-bar"><i style={{ width: `${Math.round((b.progress.have / b.progress.need) * 100)}%` }} /></span>
                      <span className="bg-prog-txt">{b.progress.have}/{b.progress.need}</span>
                    </span>
                  ) : (
                    <span className="bg-state">Vergrendeld</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
