import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { CastToTv } from '@/components/CastToTv'
import { MatchWeather } from '@/components/MatchWeather'
import { Scoreboard } from '@/components/Scoreboard'
import { SiteHeader } from '@/components/SiteHeader'
import { canAnalyse } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { formatDateTimeBE } from '@/lib/datetime'
import { buildMatchSheet, buildMatchState, buildMatchStats, buildTimeline } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { isAdultReeks, krachtbalKleur, reeksHalfDurationSeconds, reeksNaam, reeksType, type Reeks } from '@/lib/reeksen'
import { isTribuneOpen } from '@/lib/tribune'
import { BASE_RATE_PER_MIN } from '@/lib/win-probability'
import { MatchRecap } from '../../analyse/[id]/MatchRecap'
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
  // Analysewedstrijden zijn privé — lek geen ploegnamen/score in de OG-tags.
  if (matchDoc?.analyseOnly) return { title: 'Krachtbal Live' }
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
  // Analysewedstrijden horen NOOIT in de publieke competitie-UI (de eigenaar bekijkt ze via /analyse/[id]).
  if (matchDoc?.analyseOnly) notFound()
  const homeClub = (matchDoc?.homeTeam as { club?: { accommodatie?: string; plaats?: string; lat?: number; lng?: number } } | null)?.club
  const accommodatie = homeClub?.accommodatie?.trim() || null
  // Locatie voor het weerbericht aan het veld (thuislocatie).
  const weatherPlace = homeClub?.plaats?.trim() || null
  const weatherLat = typeof homeClub?.lat === 'number' ? homeClub.lat : null
  const weatherLng = typeof homeClub?.lng === 'number' ? homeClub.lng : null
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
  const datum = matchDoc?.date ? formatDateTimeBE(matchDoc.date as string) : null
  const sheetRes = await payload
    .find({ collection: 'matchsheets', where: { match: { equals: matchId } }, depth: 2, limit: 1 })
    .catch(() => null)
  const referee = (sheetRes?.docs[0]?.assignedReferee as { name?: string } | null)?.name || null

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
      {/* Match-context als kop bovenaan (reeks · datum · locatie · scheidsrechter), zodat
          duidelijk is over welke wedstrijd dit gaat. Kapiteins horen hier bewust níet bij —
          die staan op het wedstrijdblad, niet op de publieke pagina. */}
      {(reeks || datum || accommodatie || referee) && (
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
        </div>
      )}
      {/* Weerbericht aan het veld voor de thuislocatie (zolang de wedstrijd niet afgelopen is). */}
      {state.match.status !== 'finished' && matchDoc?.date && (weatherLat != null || weatherPlace) && (
        <MatchWeather date={String(matchDoc.date)} lat={weatherLat} lng={weatherLng} place={weatherPlace} />
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
        momentumGoals={share?.goals}
        momentumTimeouts={share?.timeouts}
      />
      {/* Supporters duidelijk tonen dat ze de wedstrijd op hun tv kunnen volgen. */}
      <CastToTv matchId={matchId} />

      {/* Na afloop, publiek: samenvatting (speler van de wedstrijd) + de doelpuntenmakers.
          Het scoreverloop staat vlak onder het scorebord, in de Scoreboard zelf. */}
      {share && (
        <>
          <MatchRecap stats={share.stats} teams={{ home: state.teams.home.name, away: state.teams.away.name }} />
          <MatchScorers
            players={share.stats.players}
            teams={{ home: state.teams.home.name, away: state.teams.away.name }}
            colors={{ home: state.teams.home.colors?.primary ?? null, away: state.teams.away.colors?.primary ?? null }}
          />
        </>
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
