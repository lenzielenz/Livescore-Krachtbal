import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { CastToTv } from '@/components/CastToTv'
import { MatchRain } from '@/components/MatchRain'
import { Scoreboard } from '@/components/Scoreboard'
import { SiteHeader } from '@/components/SiteHeader'
import { canAnalyse } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { buildMatchSheet, buildMatchState, buildMatchStats, buildTimeline } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { isAdultReeks, krachtbalKleur, reeksHalfDurationSeconds, reeksNaam, reeksType, type Reeks } from '@/lib/reeksen'
import { isTribuneOpen } from '@/lib/tribune'
import { BASE_RATE_PER_MIN } from '@/lib/win-probability'
import { MatchRecap } from '../../analyse/[id]/MatchRecap'
import { MomentumChart } from '../../analyse/[id]/MomentumChart'
import { ShareCard } from '../../analyse/[id]/ShareCard'
import { MatchScorers } from './MatchScorers'
import '../../analyse/analyse.css'

export const dynamic = 'force-dynamic'

// Social-preview-tekst per wedstrijd (de OG-kaart zelf komt uit opengraph-image.tsx). Zo toont een
// gedeelde matchlink in WhatsApp/Insta meteen score + ploegen i.p.v. een generieke titel.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) return { title: 'Krachtbal Live' }
  const payload = await getPayloadClient()
  const [state, matchDoc] = await Promise.all([
    buildMatchState(payload, matchId).catch(() => null),
    payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null),
  ])
  if (!state) return { title: 'Krachtbal Live' }
  const home = state.teams.home.name
  const away = state.teams.away.name
  const played = state.match.status !== 'scheduled'
  const reeks = matchDoc?.reeks ? reeksNaam(matchDoc.reeks) : 'Krachtbal'
  const scoreBit = played ? ` ${state.score.home}–${state.score.away} ` : ' – '
  const statusBit = state.match.status === 'live' ? 'LIVE · ' : state.match.status === 'finished' ? 'Eindstand · ' : ''
  const title = `${home}${scoreBit}${away} · Krachtbal Live`
  const description = `${statusBit}${reeks} — volg de wedstrijd live met score, tijdlijn en statistieken.`
  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) notFound()

  const payload = await getPayloadClient()
  let state, timeline
  try {
    ;[state, timeline] = await Promise.all([
      buildMatchState(payload, matchId),
      buildTimeline(payload, matchId),
    ])
  } catch {
    notFound()
  }

  // Extra context: reeks, datum/uur, locatie (terrein thuisclub) en toegewezen scheidsrechter.
  const matchDoc = await payload.findByID({ collection: 'matches', id: matchId, depth: 2 }).catch(() => null)
  const homeClub = (matchDoc?.homeTeam as { club?: { accommodatie?: string; plaats?: string; lat?: number; lng?: number } } | null)?.club
  const accommodatie = homeClub?.accommodatie?.trim() || null
  // Locatie voor de buienradar van de thuiswedstrijd.
  const rainPlace = homeClub?.plaats?.trim() || null
  const rainLat = typeof homeClub?.lat === 'number' ? homeClub.lat : null
  const rainLng = typeof homeClub?.lng === 'number' ? homeClub.lng : null
  // Toon de leesbare reeksnaam zonder de code-prefix ("1ste Nationale Dames" i.p.v. "1NAD — …").
  const reeks = matchDoc?.reeks ? reeksNaam(matchDoc.reeks) : null
  // Live winstkans: helftduur + verwacht scoretempo strikt uit de reeks (veilige defaults binnen reeksen.ts).
  const reeksRaw = matchDoc?.reeks as Reeks
  const halfSeconds = reeksHalfDurationSeconds(reeksRaw)
  const ratePerMin = BASE_RATE_PER_MIN[reeksType(reeksRaw)]
  // Balkleur volgt de categorie: dames rood, heren wit, U12/U14 geel, U16/U18 blauw.
  const ballKleur = krachtbalKleur(reeksRaw)
  // Enkel ingelogde bezoekers mogen shoutouts plaatsen in de live tribune.
  const me = await getAuthUser()
  const datum = matchDoc?.date
    ? new Date(matchDoc.date as string).toLocaleString('nl-BE', { dateStyle: 'long', timeStyle: 'short' })
    : null
  const sheetRes = await payload
    .find({ collection: 'matchsheets', where: { match: { equals: matchId } }, depth: 2, limit: 1 })
    .catch(() => null)
  const referee = (sheetRes?.docs[0]?.assignedReferee as { name?: string } | null)?.name || null

  // Kapiteins (één per ploeg) — bij depth 2 zijn dit speler-objecten met naam + rugnummer.
  const capName = (c: unknown): string | null => {
    if (!c || typeof c !== 'object') return null
    const p = c as { name?: string; shirtNumber?: number }
    if (!p.name) return null
    return p.shirtNumber != null ? `#${p.shirtNumber} ${p.name}` : p.name
  }
  const homeCaptain = capName(matchDoc?.homeCaptain)
  const awayCaptain = capName(matchDoc?.awayCaptain)

  // Publiek deel-/napraatmoment: zodra de wedstrijd afgelopen is, bouwen we de samenvatting +
  // deelkaart voor IEDEREEN (niet enkel achter analyse-login). Dit is het virale moment — supporters
  // delen de kaart of nemen er een screenshot van. Faalt de opbouw, dan tonen we gewoon niets.
  let share: {
    reeks: string
    datum: string | null
    stats: Awaited<ReturnType<typeof buildMatchStats>>['stats']
    goals: { side: 'home' | 'away'; points: number; half: number; gameClock: number }[]
    timeouts: { side: 'home' | 'away'; half: number; gameClock: number }[]
  } | null = null
  if (state.match.status === 'finished') {
    try {
      const [statsRes, sheet, toRes] = await Promise.all([
        buildMatchStats(payload, matchId),
        buildMatchSheet(payload, matchId).catch(() => null),
        payload
          .find({ collection: 'match-events', where: { and: [{ match: { equals: matchId } }, { type: { equals: 'timeout' } }] }, depth: 0, limit: 100 })
          .catch(() => ({ docs: [] as Record<string, unknown>[] })),
      ])
      const goals = (sheet?.goals ?? [])
        .slice()
        .sort((a, b) => a.half - b.half || a.gameClock - b.gameClock)
        .map((g) => ({ side: g.side, points: g.points, half: g.half, gameClock: g.gameClock }))
      // Time-outs op de tijdas voor de momentum-grafiek (verticale streep op het juiste moment).
      const homeTeamId = state.teams.home.id
      const timeouts = toRes.docs.map((e) => {
        const tId = (e as { team?: unknown }).team
        const teamId = tId && typeof tId === 'object' ? Number((tId as { id?: number }).id) : Number(tId)
        return {
          side: (teamId === homeTeamId ? 'home' : 'away') as 'home' | 'away',
          half: Number((e as { half?: unknown }).half ?? 1),
          gameClock: Number((e as { gameClock?: unknown }).gameClock ?? 0),
        }
      })
      share = { reeks: reeks ?? 'Krachtbal', datum, stats: statsRes.stats, goals, timeouts }
    } catch {
      share = null
    }
  }

  // Vluchtige foto-tribune: ENKEL op volwassen reeksen (safeguarding, geen jeugd). Laad de recente,
  // niet-verlopen foto's; posten mag enkel ingelogd terwijl de tribune open is.
  const adultMatch = isAdultReeks(reeksRaw)
  const canPostInstant = Boolean(me) && adultMatch && isTribuneOpen(state.match.status, state.match.finishedAt)
  let initialInstants: { id: number; url: string; authorName: string; at: number }[] = []
  if (adultMatch) {
    const res = await payload
      .find({
        collection: 'match-instants',
        where: { and: [{ match: { equals: matchId } }, { expiresAt: { greater_than: new Date().toISOString() } }] },
        sort: '-createdAt',
        depth: 0,
        limit: 30,
      })
      .catch(() => null)
    initialInstants = (res?.docs ?? []).map((d) => ({
      id: d.id as number,
      url: (d as { url?: string | null }).url || `/api/match-instants/file/${(d as { filename?: string }).filename ?? ''}`,
      authorName: (d as { authorName?: string | null }).authorName || 'Supporter',
      at: d.createdAt ? new Date(d.createdAt as string).getTime() : Date.now(),
    }))
  }

  return (
    <>
      <SiteHeader active="wedstrijden" />
      <div className="site">
      <Link href="/" className="back-link">
        ← Alle wedstrijden
      </Link>
      {/* Match-context als kop bovenaan (reeks · datum · locatie · scheidsrechter · kapiteins),
          zodat duidelijk is over welke wedstrijd dit gaat — i.p.v. een losse regel onderaan. */}
      {(reeks || datum || accommodatie || referee || homeCaptain || awayCaptain) && (
        <div className="match-info match-info-top">
          {(reeks || datum) && (
            <div className="match-info-row">
              {reeks && <span className="match-info-reeks">{reeks}</span>}
              {datum && <span>{datum}</span>}
            </div>
          )}
          {accommodatie && (
            <div className="match-info-row">
              <span aria-hidden>📍</span> <span>{accommodatie}</span>
            </div>
          )}
          {referee && (
            <div className="match-info-row">
              <span aria-hidden>🟡</span> <span>Scheidsrechter: {referee}</span>
            </div>
          )}
          {(homeCaptain || awayCaptain) && (
            <div className="match-info-row">
              <span aria-hidden>🅒</span>{' '}
              <span>
                Kapiteins: {state.teams.home.name} — {homeCaptain ?? '—'} · {state.teams.away.name} — {awayCaptain ?? '—'}
              </span>
            </div>
          )}
        </div>
      )}
      {/* Mini-buienradar voor de thuiswedstrijd (zolang ze nog niet afgelopen is). */}
      {state.match.status !== 'finished' && matchDoc?.date && (rainLat != null || rainPlace) && (
        <MatchRain date={String(matchDoc.date)} lat={rainLat} lng={rainLng} place={rainPlace} />
      )}
      <Scoreboard
        matchId={matchId}
        initial={{ state, timeline }}
        halfSeconds={halfSeconds}
        ratePerMin={ratePerMin}
        ballKleur={ballKleur}
        canChat={Boolean(me)}
        initialReactions={(matchDoc?.liveReactions as Record<string, number> | null) ?? undefined}
        initialShouts={Array.isArray(matchDoc?.liveShoutouts) ? (matchDoc.liveShoutouts as { id: number; name: string; text: string; at: number }[]) : undefined}
        canPostInstant={canPostInstant}
        initialInstants={initialInstants}
      />
      {/* Supporters duidelijk tonen dat ze de wedstrijd op hun tv kunnen volgen. */}
      <CastToTv matchId={matchId} />

      {/* Na afloop, publiek onder het scorebord: het scoreverloop (momentum) + iedereen die scoorde. */}
      {share && (
        <>
          <MomentumChart
            goals={share.goals}
            timeouts={share.timeouts}
            teams={{ home: state.teams.home.name, away: state.teams.away.name }}
            colors={{ home: state.teams.home.colors?.primary ?? null, away: state.teams.away.colors?.primary ?? null }}
          />
          <MatchScorers
            players={share.stats.players}
            teams={{ home: state.teams.home.name, away: state.teams.away.name }}
            colors={{ home: state.teams.home.colors?.primary ?? null, away: state.teams.away.colors?.primary ?? null }}
          />
        </>
      )}

      {/* Publiek deel-/napraatmoment na afloop — voor iedereen, zonder login. */}
      {share && (
        <section className="match-share" style={{ marginTop: 28 }}>
          <h2 className="section-title">Napraten &amp; delen</h2>
          <MatchRecap stats={share.stats} teams={{ home: state.teams.home.name, away: state.teams.away.name }} />
          <ShareCard
            matchId={matchId}
            teams={{ home: state.teams.home.name, away: state.teams.away.name }}
            score={{ home: state.score.home, away: state.score.away }}
            colors={{ home: state.teams.home.colors?.primary ?? null, away: state.teams.away.colors?.primary ?? null }}
            logos={{ home: state.teams.home.logoUrl, away: state.teams.away.logoUrl }}
            goals={share.goals}
            players={share.stats.players}
            reeks={share.reeks}
            datum={share.datum}
          />
        </section>
      )}
      {canAnalyse(me) && (
        <p className="sheet-cta">
          <Link href={`/analyse/${matchId}`} className="back-link">
            📈 Analyse &amp; video
          </Link>
        </p>
      )}
      </div>
    </>
  )
}
