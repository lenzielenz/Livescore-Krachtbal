import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { competitionWhere } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { aanwezigheidVoorBadges } from '@/lib/badge-stats'
import { computeBadges, earnedCount, type Badge, type BadgeStats, type Rarity } from '@/lib/badges'
import { sanitizeCheckins } from '@/lib/checkins'
import { fanScore } from '@/lib/fan-score'
import { buildMatchState } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { buildPredictionLeaderboard, rankLeaderboard, type PredEntry } from '@/lib/prediction-score'
import { trustLevel, trustScore } from '@/lib/score-trust'
import { readUserTrust } from '@/lib/score-trust-store'
import { seasonFromDate } from '@/lib/seasons'
import './badges.css'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Mijn badges — Krachtbal Live' }

const RARITY_LABEL: Record<Rarity, string> = { brons: 'Brons', zilver: 'Zilver', goud: 'Goud', legende: 'Legende' }

/** Vanaf 60% voortgang telt een badge als "bijna" — trekt het oog naar wat haalbaar is. */
const CLOSE_RATIO = 0.6
const isClose = (b: Badge) => !b.earned && !!b.progress && b.progress.have / b.progress.need >= CLOSE_RATIO

/** Elk van deze sleutels krijgt, eens verdiend, een eigen bij het onderwerp passende animatie
 *  i.p.v. de generieke halo-gloed — zie badges.css voor de bijhorende stijlen. */
function BadgeEmoji({ badge }: { badge: Badge }) {
  if (!badge.earned) return <span className="bg-emoji">{badge.emoji}</span>

  switch (badge.key) {
    case 'checkin1':
      return (
        <span className="bg-emoji ticket-emoji" aria-hidden>
          <span className="fx-halo" style={{ ['--fx' as string]: '#ffd166' }} />
          {badge.emoji}
          <span className="confetti c1" />
          <span className="confetti c2" />
        </span>
      )
    case 'checkin5':
      return (
        <span className="bg-emoji flame-emoji" aria-hidden>
          <span className="flame-glow" />
          <span className="flame flame-outer" />
          <span className="flame flame-mid" />
          <span className="flame flame-core" />
          <span className="ember e1" />
          <span className="ember e2" />
        </span>
      )
    case 'checkin15':
      return (
        <span className="bg-emoji stadium-fx" aria-hidden>
          <span className="fx-halo" />
          <span className="beam b1" />
          <span className="beam b2" />
          <span className="beam b3" />
          {badge.emoji}
        </span>
      )
    case 'checkin30':
      return (
        <span className="bg-emoji crown-fx" aria-hidden>
          <span className="fx-halo" />
          {badge.emoji}
          <span className="fx-spark s1" />
          <span className="fx-spark s2" />
          <span className="fx-spark s3" />
          <span className="ray r1" />
          <span className="ray r2" />
        </span>
      )
    case 'checkin50':
      return (
        <span className="bg-emoji lion-fx" aria-hidden>
          <span className="fx-halo" />
          <span className="fx-ring" />
          <span className="fx-ring r2" />
          {badge.emoji}
        </span>
      )
    case 'photo10':
      return (
        <span className="bg-emoji camera-fx" aria-hidden>
          <span className="fx-ring" />
          <span className="lens-glint" />
          {badge.emoji}
        </span>
      )
    case 'pred10':
      return (
        <span className="bg-emoji target-fx" aria-hidden>
          <span className="fx-halo" />
          <span className="fx-ring" />
          {badge.emoji}
        </span>
      )
    case 'predpoints100':
      return (
        <span className="bg-emoji diamond-fx" aria-hidden>
          <span className="fx-halo" style={{ ['--fx' as string]: '#cdeeff' }} />
          <span className="facet" />
          {badge.emoji}
          <span className="fx-spark d1" />
          <span className="fx-spark d2" />
        </span>
      )
    case 'superfan':
      return (
        <span className="bg-emoji megaphone-fx" aria-hidden>
          {badge.emoji}
          <span className="soundwave w1" />
          <span className="soundwave w2" />
        </span>
      )
    case 'booster':
      return (
        <span className="bg-emoji wheel-emoji" aria-hidden>
          <span className="wheel-wrap">
            <span className="wheel-ring" />
            <span className="wheel-hub">{badge.emoji}</span>
            <span className="wheel-spark s1">✦</span>
            <span className="wheel-spark s2">✦</span>
            <span className="wheel-spark s3">✦</span>
          </span>
        </span>
      )
    default:
      return (
        <span className="bg-emoji" aria-hidden>
          <span className="fx-halo" />
          {badge.emoji}
        </span>
      )
  }
}

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
  const myPred = rankLeaderboard(buildPredictionLeaderboard(scored)).find((r) => r.userId === myUserId)
  const predictionPoints = myPred?.points ?? 0

  // Trust-historiek van het aantekenen. De score zelf blijft onzichtbaar; enkel het bereikte
  // niveau vertaalt zich in een badge (zie score-trust.ts).
  const myTrust = await readUserTrust(payload, myUserId)

  const myCheckins = sanitizeCheckins(u.checkins)
  const checkins = myCheckins.length
  const clubRaw = u.club
  const eigenClub = Number(clubRaw && typeof clubRaw === 'object' ? (clubRaw as { id?: unknown }).id : clubRaw)
  const aanwezig = await aanwezigheidVoorBadges(payload, myCheckins, Number.isFinite(eigenClub) && eigenClub > 0 ? eigenClub : null)
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
    scoredMatches: myTrust.confirmed,
    trustedScorer: trustLevel(trustScore(myTrust)) === 'vertrouwd',
    ...aanwezig,
    exactPredictions: myPred?.exact ?? 0,
    // Enkel wie effectief punten heeft, staat echt in het klassement.
    predictionRank: myPred && myPred.points > 0 ? myPred.rank : null,
  }

  const badges = computeBadges(stats)
  const earned = earnedCount(badges)
  const total = badges.length

  // "Dichtstbij": de niet-verdiende badge met de hoogste voortgangsverhouding — de badge waar
  // je effectief het snelst bij kan geraken, niet toevallig de eerste in de lijst.
  const next = badges
    .filter((b): b is Badge & { progress: NonNullable<Badge['progress']> } => !b.earned && !!b.progress)
    .reduce<(Badge & { progress: NonNullable<Badge['progress']> }) | null>((best, b) => {
      if (!best) return b
      return b.progress.have / b.progress.need > best.progress.have / best.progress.need ? b : best
    }, null)

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
          Verzamel badges door wedstrijden bij te wonen (ook op verplaatsing), sfeerfoto’s te plaatsen,
          uitslagen juist te voorspellen, te stemmen voor de held van de match en zelf aan te tekenen.
          Brons haal je snel — goud en legende vragen een heel seizoen inzet.
          {' '}<Link href="/profiel/paspoort" style={{ color: 'var(--accent)', fontWeight: 700 }}>Supporterpaspoort →</Link>
        </p>

        <div className="bg-progress">
          <div className="bg-progress-top">
            <span className="bg-progress-count">{earned}<i>/{total}</i></span>
            <span className="bg-progress-lbl">badges verdiend</span>
          </div>
          <div className="bg-bar"><span style={{ width: `${Math.round((earned / total) * 100)}%` }} /></div>
          <div className="bg-rarity-sum" aria-label="Verdiend per zeldzaamheid">
            {(['brons', 'zilver', 'goud', 'legende'] as Rarity[]).map((r) => (
              <span key={r} className={`bg-rarity r-${r}`}>
                {RARITY_LABEL[r]} {badges.filter((b) => b.rarity === r && b.earned).length}/{badges.filter((b) => b.rarity === r).length}
              </span>
            ))}
          </div>
          {next && (
            <div className="bg-next">
              <span className="bg-next-icon" aria-hidden>{next.emoji}</span>
              <div className="bg-next-copy">
                <span className="bg-next-kicker">Dichtstbij</span>
                <p className="bg-next-title">{next.title} — nog {next.progress.need - next.progress.have} te gaan</p>
                <div className="bg-next-bar"><span style={{ width: `${Math.round((next.progress.have / next.progress.need) * 100)}%` }} /></div>
                <span className="bg-next-txt">{next.progress.have}/{next.progress.need} · {next.desc}</span>
              </div>
            </div>
          )}
        </div>

        {groups.map((g) => (
          <section key={g.name} className="bg-group">
            <h2 className="bg-group-title">{g.name}</h2>
            <div className="bg-grid">
              {g.items.map((b) => (
                <div key={b.key} className={`bg-card${b.earned ? ' is-earned' : ''}${isClose(b) ? ' is-close' : ''}`}>
                  {isClose(b) && <span className="bg-close-tag">Bijna!</span>}
                  <BadgeEmoji badge={b} />
                  <span className={`bg-rarity r-${b.rarity}`}>{RARITY_LABEL[b.rarity]}</span>
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
