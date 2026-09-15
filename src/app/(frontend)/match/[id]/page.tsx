import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { CastToTv } from '@/components/CastToTv'
import { CheckInButton } from '@/components/CheckInButton'
import { MatchStats } from '@/components/MatchStats'
import { MatchWeather } from '@/components/MatchWeather'
import { Scoreboard } from '@/components/Scoreboard'
import { SiteHeader } from '@/components/SiteHeader'
import { TeamLogo } from '@/components/TeamLogo'
import { hasRole, isFederationLevel } from '@/lib/access'
import { competitionWhere } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { mayEditMatchVideo } from '@/lib/video-access'
import { isCheckedIn, sanitizeCheckins } from '@/lib/checkins'
import { dateStrBE, formatDateTimeBE } from '@/lib/datetime'
import { googleCalendarUrl } from '@/lib/google-calendar'
import { matchTitel } from '@/lib/match-ics'
import { buildMatchSheet, buildMatchState, buildMatchStats, buildTimeline, type SheetGoal } from '@/lib/match-engine'
import { buildMatchReport } from '@/lib/match-report'
import { getPayloadClient } from '@/lib/payload-client'
import { activeTokens, type RadToken } from '@/lib/pronostiek-rad'
import { countUserWeekendPredictions, LIVE_PRONOSTIEK_MAX_PER_WEEKEND, pronostiekOpen, pronostiekOpenVanaf } from '@/lib/pronostiek-weekend'
import { isAdultReeks, krachtbalKleur, reeksHalfDurationSeconds, reeksNaam, reeksType, type Reeks } from '@/lib/reeksen'
import { isSupportersMode } from '@/lib/score-mode'
import { mayClaim, mayVote, sanitizeTrust, voteWindowOpen } from '@/lib/score-trust'
import { MATCH_ASSUMED_DONE_MS } from '@/lib/simple-score'
import { isTribuneOpen } from '@/lib/tribune'
import { BASE_RATE_PER_MIN } from '@/lib/win-probability'
import { MatchRecap } from '../../analyse/[id]/MatchRecap'
import { LiveStream } from './LiveStream'
import { MatchScorers } from './MatchScorers'
import { MatchActivitySummary } from './MatchActivitySummary'
import { PronostiekWidget } from './PronostiekWidget'
import { ReportResult } from './ReportResult'
import { ScoreTrust } from './ScoreTrust'
import { ToekomstigeWedstrijd } from './ToekomstigeWedstrijd'
import { WedstrijdBeheer } from './WedstrijdBeheer'
import { WinfieCard } from './WinfieCard'
import { clubsOpId, type BeheerClub } from '@/lib/ploeg-rechtzetten'
import type { BeheerPloeg } from '@/components/PloegVelden'
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
  // Globale supporters-modus: iedereen mag de score doorgeven → toon een "Aantekenen"-knop.
  const supportersMode = await isSupportersMode(payload)
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
  // Video koppelen/uploaden mag de federatie (competitiewedstrijden) — zie mayEditMatchVideo.
  const mayVideo = mayEditMatchVideo(me, matchDoc as { analyseOnly?: boolean | null; analyseOwner?: unknown } | null)
  const datum = matchDoc?.date ? formatDateTimeBE(matchDoc.date as string) : null
  // Wie de wedstrijd mag rechtzetten (tijdstip + ploegnaam/club): de federatie, en nooit op een
  // analysewedstrijd — die is privé en wordt onder /analyse/beheer beheerd.
  const magBeheren =
    (isFederationLevel(me) || hasRole(me, 'federatie')) && !(matchDoc as { analyseOnly?: boolean } | null)?.analyseOnly
  const alsPloeg = (t: unknown): BeheerPloeg | null => {
    if (!t || typeof t !== 'object') return null
    const d = t as { id?: number; name?: unknown; club?: unknown; reeks?: unknown }
    if (typeof d.id !== 'number') return null
    const club = d.club
    const clubId = club && typeof club === 'object' ? ((club as { id?: number }).id ?? null) : typeof club === 'number' ? club : null
    return { id: d.id, naam: String(d.name ?? ''), clubId, reeks: typeof d.reeks === 'string' ? d.reeks : null }
  }
  const beheerThuis = magBeheren ? alsPloeg(matchDoc?.homeTeam) : null
  const beheerUit = magBeheren ? alsPloeg(matchDoc?.awayTeam) : null
  // Enkel de clubs die deze twee ploegen nú hebben, met hun naam — om ze te tonen. Een andere club
  // kies je door te zoeken (er staan er te veel in de database voor een keuzelijst).
  const clubKeuze: BeheerClub[] = magBeheren
    ? await clubsOpId(payload, [beheerThuis?.clubId, beheerUit?.clubId])
    : []
  // Een wedstrijd die pas later gespeeld wordt, heeft geen scorebord nodig: er valt niets te volgen
  // en niets door te geven. Alles wat met "live" te maken heeft (bord, aantekenen, tribune, cast,
  // vertrouwenslaag) blijft dan weg; je krijgt de aankondiging met agenda-knoppen.
  // "Later" = niet vandaag én de aftrap ligt nog voor ons — zo blijft een oude, nooit-ingevulde
  // wedstrijd wél zijn "geef de uitslag door"-flow houden.
  const matchDatum = matchDoc?.date ? String(matchDoc.date) : null
  const isMatchDag = Boolean(matchDatum) && dateStrBE(new Date(matchDatum as string)) === dateStrBE()
  const toekomstig =
    state.match.status === 'scheduled' &&
    Boolean(matchDatum) &&
    !isMatchDag &&
    new Date(matchDatum as string).getTime() > Date.now()
  // Agenda-link voor die aankondiging: zelfde titel, terrein en omschrijving als in /zoeken en in
  // het .ics-bestand, zodat een wedstrijd er in je agenda hetzelfde uitziet langs welke weg ook.
  let googleAgenda = ''
  if (toekomstig && matchDatum) {
    const h = await headers()
    const host = h.get('x-forwarded-host') ?? h.get('host') ?? ''
    const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
    const origin = host ? `${proto}://${host}` : ''
    // Het terrein is altijd dat van de thuisploeg: accommodatie als de club ze invulde, anders de gemeente.
    const terrein = accommodatie || homeClub?.plaats?.trim() || null
    googleAgenda = googleCalendarUrl({
      title: matchTitel(state.teams.home.name, state.teams.away.name, reeks),
      startIso: matchDatum,
      location: terrein,
      details: [
        reeks ? `Reeks: ${reeks}` : null,
        `Thuisploeg: ${state.teams.home.name}`,
        terrein ? `Terrein: ${terrein}` : 'Terrein: nog niet gekend',
        origin ? `Live volgen: ${origin}/match/${matchId}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    })
  }
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
    shots: Awaited<ReturnType<typeof buildMatchStats>>['shots']
    goals: { side: 'home' | 'away'; points: number; half: number; gameClock: number }[]
    timeouts: { side: 'home' | 'away'; half: number; gameClock: number }[]
    /** Doelpunten mét scorer — voedt het automatische matchverslag. */
    sheetGoals: SheetGoal[]
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
      const sheetGoals = (sheet?.goals ?? []).slice().sort((a, b) => a.half - b.half || a.gameClock - b.gameClock)
      const goals = sheetGoals.map((g) => ({ side: g.side, points: g.points, half: g.half, gameClock: g.gameClock }))
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
      share = { reeks: reeks ?? 'Krachtbal', datum, stats: statsRes.stats, shots: statsRes.shots, goals, timeouts, sheetGoals }
    } catch {
      share = null
    }
  }

  // Blijvende foto-tribune: ENKEL op volwassen reeksen (safeguarding, geen jeugd). Laad alle
  // bewaarde foto's; posten mag enkel ingelogd terwijl de wedstrijd bezig is/pas voorbij —
  // bewust NIET verruimd naar "matchday vóór de aftrap" (in tegenstelling tot reacties/chat): een
  // foto van een wedstrijd die nog niet begonnen is, bestaat niet.
  const adultMatch = isAdultReeks(reeksRaw)
  const canPostInstant = Boolean(me) && adultMatch && isTribuneOpen(state.match.status, state.match.finishedAt)
  let initialInstants: { id: number; url: string; authorName: string; at: number }[] = []
  if (adultMatch) {
    const res = await payload
      .find({
        collection: 'match-instants',
        where: { match: { equals: matchId } },
        sort: '-createdAt',
        depth: 0,
        pagination: false,
      })
      .catch(() => null)
    initialInstants = (res?.docs ?? []).map((d) => {
      // Relatieve same-origin URL (zie upload-route): voorkomt geblokkeerde absolute/mixed-content links.
      const fn = (d as { filename?: string }).filename
      return {
        id: d.id as number,
        url: fn ? `/api/match-instants/file/${encodeURIComponent(fn)}` : ((d as { url?: string | null }).url || ''),
        authorName: (d as { authorName?: string | null }).authorName || 'Supporter',
        at: d.createdAt ? new Date(d.createdAt as string).getTime() : Date.now(),
      }
    })
  }

  // Automatisch matchverslag (krantstijl) na afloop: volledig afgeleid uit de doelpunten-events
  // en de kruisjes. Geen opgeslagen tekst — het verslag wordt telkens opgebouwd.
  const report =
    share && state.match.status === 'finished'
      ? buildMatchReport({
          home: state.teams.home.name,
          away: state.teams.away.name,
          score: state.score,
          crosses: state.crosses,
          goals: share.sheetGoals.map((g) => ({
            half: g.half,
            gameClock: g.gameClock,
            side: g.side,
            points: g.points,
            playerName: g.playerName,
            shirtNumber: g.shirtNumber,
          })),
          reeks,
          datum,
        })
      : null

  // Vertrouwenslaag: enkel zinvol bij een vrije supporters-score. Wie zelf meetekende, mag niet
  // bevestigen (geen onafhankelijke controle); wie niets claimde, kan het aantekenen overnemen.
  const trust = state.trust
  const trustState = sanitizeTrust((matchDoc as { scoreTrust?: unknown } | null)?.scoreTrust)
  const meId = me ? Number((me as { id?: number }).id) : null
  const trustMe =
    meId != null
      ? {
          isScorer: trustState.scorerId === meId,
          mayClaim: state.match.status !== 'finished' && mayClaim(trustState, meId),
          mayVote:
            voteWindowOpen(state.match.status, state.match.finishedAt) && mayVote(trustState, meId),
          myVote: trustState.confirms.some((v) => v.userId === meId)
            ? ('confirm' as const)
            : trustState.disputes.some((v) => v.userId === meId)
              ? ('dispute' as const)
              : null,
        }
      : null

  // Live-pronostiek: eigen (vergrendelde) voorspelling + resterende beurten dit weekend.
  const myUid = me ? Number((me as { id?: number }).id) : null
  const myPred = myUid != null && Array.isArray(matchDoc?.scorePredictions)
    ? (matchDoc!.scorePredictions as { userId: number; home: number; away: number }[]).find((p) => Number(p?.userId) === myUid)
    : null
  let predRemaining = LIVE_PRONOSTIEK_MAX_PER_WEEKEND
  if (myUid != null && !myPred && (state.match.status === 'scheduled' || state.match.status === 'live') && matchDoc?.date) {
    const used = await countUserWeekendPredictions(payload, myUid, String(matchDoc.date), matchId).catch(() => 0)
    predRemaining = Math.max(0, LIVE_PRONOSTIEK_MAX_PER_WEEKEND - used)
  }
  // Persoonlijke bonusrad-boosters van deze gebruiker (gewonnen door bij de top 3 te eindigen),
  // enkel de nog geldige (niet-vervallen).
  const myBoosters = activeTokens(((me as { pronostiekPower?: { tokens?: RadToken[] } | null } | null)?.pronostiekPower)?.tokens)
    .map((t) => Number(t.mult))

  return (
    <>
      <SiteHeader active="wedstrijden" />
      <div className="site">
      <Link href="/" className="back-link">
        ← Alle wedstrijden
      </Link>
      {/* Supporters-modus: vrije livescore. Iedereen kan meteen beginnen aantekenen — geen
          scheidsrechter of aftekenen nodig. */}
      {supportersMode && state.match.status !== 'finished' && !toekomstig && (
        <Link href={`/scorekeeper/${matchId}`} className="match-score-cta">
          <span aria-hidden>✏️</span>
          <span>
            {state.match.status === 'live'
              ? 'Aantekenen — verder scoren'
              : 'Aantekenen — start de wedstrijd'}
          </span>
          <span className="match-score-cta-arrow" aria-hidden>→</span>
        </Link>
      )}
      {/* Aftrap ruim voorbij maar niemand tekende aan? Dan geeft een supporter hier de eindstand
          door (de vertrouwenslaag labelt ze 🟡 tot anderen bevestigen). Zelfde venster als het
          live-bord en de server-guard: pas als de match zeker gedaan is. */}
      {supportersMode &&
        state.match.status === 'scheduled' &&
        matchDoc?.date &&
        Date.now() >= new Date(matchDoc.date as string).getTime() + MATCH_ASSUMED_DONE_MS && (
          <ReportResult
            matchId={matchId}
            loggedIn={Boolean(me)}
            homeName={state.teams.home.name}
            awayName={state.teams.away.name}
          />
        )}
      {/* Match-context als kop bovenaan (reeks · datum · locatie · scheidsrechter), zodat
          duidelijk is over welke wedstrijd dit gaat. Kapiteins horen hier bewust níet bij —
          die staan op het wedstrijdblad, niet op de publieke pagina. */}
      {(reeks || datum || accommodatie || referee) && (
        <div className="match-meta">
          {reeks && <span className="match-meta-reeks">{reeks}</span>}
          {datum && <span className="match-meta-bit">{datum}</span>}
          {accommodatie && <span className="match-meta-bit">📍 {accommodatie}</span>}
          {referee && <span className="match-meta-bit">🟡 {referee}</span>}
          {/* Bij een wedstrijd die nog moet komen staan de agenda-knoppen groot in het blok
              hieronder — dan hoeft dit chipje er niet nóg eens bij. */}
          {state.match.status === 'scheduled' && matchDoc?.date && !toekomstig && (
            <a className="match-meta-bit match-meta-cal" href={`/api/match/${matchId}/ics`}>📅 In agenda</a>
          )}
          {/* Wie de video van deze wedstrijd mag beheren, ziet hier meteen wáár dat gebeurt —
              anders is de video-analyse alleen te vinden als je de analysepagina al kent. */}
          {mayVideo && (
            <Link className="match-meta-bit match-meta-video" href={`/analyse/${matchId}#video`}>
              🎥 {matchDoc?.videoUrl ? 'Video bekijken' : 'Video toevoegen'}
            </Link>
          )}
        </div>
      )}
      {/* Nog te spelen: een affiche i.p.v. een scorebord op 0–0 — logo's en clubkleuren zoals op
          de live-bordkaarten, met de aftrap eronder. Bewaren + agenda. */}
      {toekomstig && (
        <>
          <section
            className="match-affiche"
            aria-label="Nog te spelen"
            style={{
              '--hc': state.teams.home.colors?.primary ?? 'var(--accent)',
              '--ac': state.teams.away.colors?.primary ?? 'var(--accent)',
            } as React.CSSProperties}
          >
            <span className="match-affiche-kleur" aria-hidden />
            <div className="match-affiche-teams">
              <div className="match-affiche-team">
                <span className="match-affiche-logo">
                  <TeamLogo
                    name={state.teams.home.name}
                    logoUrl={state.teams.home.logoUrl}
                    logoFit={state.teams.home.logoFit}
                    side="home"
                    size={64}
                    ringColor={state.teams.home.colors?.primary}
                  />
                </span>
                <span className="match-affiche-naam">{state.teams.home.name}</span>
              </div>
              <span className="match-affiche-vs">VS</span>
              <div className="match-affiche-team">
                <span className="match-affiche-logo">
                  <TeamLogo
                    name={state.teams.away.name}
                    logoUrl={state.teams.away.logoUrl}
                    logoFit={state.teams.away.logoFit}
                    side="away"
                    size={64}
                    ringColor={state.teams.away.colors?.primary}
                  />
                </span>
                <span className="match-affiche-naam">{state.teams.away.name}</span>
              </div>
            </div>
            {datum && <p className="match-affiche-wanneer">{datum}</p>}
          </section>
          <ToekomstigeWedstrijd
            wedstrijd={{
              id: matchId,
              home: state.teams.home.name,
              away: state.teams.away.name,
              date: matchDatum ?? '',
              reeks,
            }}
            googleUrl={googleAgenda}
          />
        </>
      )}
      {/* Weerbericht aan het veld voor de thuislocatie. Het paneel verbergt zichzelf zodra de
          napraatperiode voorbij is (een paar uur na de aftrap) — ook voor afgelopen wedstrijden
          blijft het dus even staan, net als de tribune. */}
      {matchDoc?.date && (weatherLat != null || weatherPlace) && (
        <MatchWeather date={String(matchDoc.date)} lat={weatherLat} lng={weatherLng} place={weatherPlace} />
      )}
      {/* Pronostiek bovenaan, vóór het scorebord — zo verdwijnt ze niet onder de reacties/tijdlijn.
          Eens ingevuld wordt ze heel compact (zie de widget). */}
      <PronostiekWidget
        matchId={matchId}
        status={state.match.status}
        loggedIn={Boolean(me)}
        homeName={state.teams.home.name}
        awayName={state.teams.away.name}
        initialHome={myPred ? myPred.home : null}
        initialAway={myPred ? myPred.away : null}
        remaining={predRemaining}
        max={LIVE_PRONOSTIEK_MAX_PER_WEEKEND}
        boosterTokens={myBoosters}
        pronostiekOpen={Boolean(matchDatum) && pronostiekOpen(matchDatum as string)}
        openVanafTekst={matchDatum ? formatDateTimeBE(pronostiekOpenVanaf(matchDatum), { dateStyle: 'full' }) : null}
      />
      {/* Alles wat "live" is — bord, tijdlijn, tribune, vertrouwenslaag, stream — slaan we over
          zolang de wedstrijd nog moet komen. */}
      {!toekomstig && (
        <>
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
      {me && state.match.status === 'finished' && (
        <MatchActivitySummary
          reactions={(matchDoc?.liveReactions as Record<string, number> | null) ?? {}}
          shouts={Array.isArray(matchDoc?.liveShoutouts) ? (matchDoc.liveShoutouts as { id: number; name: string; text: string; at: number }[]) : []}
          photos={initialInstants}
        />
      )}
      {/* Vertrouwenslaag onder het scorebord: wie tekent aan, en klopt deze stand? Alleen bij een
          vrije supporters-score — in de federatieflow is de uitslag per definitie officieel. */}
      {trust.label !== 'official' && state.match.status !== 'scheduled' && (
        <ScoreTrust
          matchId={matchId}
          initial={trust}
          loggedIn={Boolean(me)}
          initialMayClaim={trustMe?.mayClaim ?? false}
          initialMayVote={trustMe?.mayVote ?? false}
          initialMyVote={trustMe?.myVote ?? null}
          isScorer={trustMe?.isScorer ?? false}
        />
      )}

      {/* Live-uitzending van de wedstrijd (externe stream), als de beheerder er een instelde. */}
      {matchDoc?.livestreamUrl && (
        <LiveStream url={String(matchDoc.livestreamUrl)} live={state.match.status === 'live'} />
      )}
        </>
      )}

      {/* Niet ingelogd? Toon dan wat je hier mist — concreet, niet als reclame. Wie enkel de
          score komt halen, heeft alles al gezien; wie meedoet, krijgt er een wedstrijd bij. */}
      {!me && (
        <section className="match-meedoen">
          <h2 className="match-meedoen-titel">Meedoen kan ook</h2>
          <ul className="match-meedoen-lijst">
            <li><span aria-hidden>💬</span> Moedig aan in de tribune — je bericht verschijnt live op het scorebord</li>
            <li><span aria-hidden>🔮</span> Voorspel de uitslag en klim in de pronostiekstand</li>
            <li><span aria-hidden>⭐</span> Stem op de held van de match</li>
            <li><span aria-hidden>🎫</span> Duid aan dat je erbij was — dat vult je supporterspaspoort en levert badges op</li>
          </ul>
          <div className="match-meedoen-knoppen">
            <Link href="/registreren" className="match-meedoen-btn">Gratis account →</Link>
            <Link href="/inloggen" className="match-meedoen-link">Al lid? Inloggen</Link>
          </div>
        </section>
      )}

      {/* "Ik ben erbij" — supporters bouwen zo hun seizoenspaspoort op. Pas op de dag zelf: je
          bent er niet bij op een wedstrijd die nog drie weken weg is. Een opvallend, kleurrijk
          blok i.p.v. een kale knop: de badge-ladder maakt meteen duidelijk waarom aanklikken
          loont, en dit is exact het cijfer dat later in het weekoverzicht pronkt. */}
      {me && !toekomstig && (() => {
        const checkedIn = isCheckedIn(sanitizeCheckins((me as { checkins?: unknown }).checkins), matchId)
        return (
          <section className={`match-checkin ${checkedIn ? 'is-on' : ''}`} aria-label="Ik ben erbij">
            <div className="match-checkin-row">
              <CheckInButton matchId={matchId} initial={checkedIn} />
              <Link href="/profiel/paspoort" className="match-checkin-link">Mijn paspoort →</Link>
            </div>
            <p className="match-checkin-hint">
              {checkedIn
                ? 'Dit telt mee in het weekoverzicht en voor je badges.'
                : 'Duid aan dat je erbij bent: het telt mee voor je badges en verschijnt in het weekoverzicht.'}
              <span className="match-checkin-badges" aria-hidden>🎟️ 🔥 🏟️ 👑 🦁</span>
            </p>
          </section>
        )
      })()}

      {/* Supporters duidelijk tonen dat ze de wedstrijd op hun tv kunnen volgen. */}
      {!toekomstig && <CastToTv matchId={matchId} />}

      {/* Na afloop, publiek: samenvatting (speler van de wedstrijd) + de doelpuntenmakers.
          Het scoreverloop staat vlak onder het scorebord, in de Scoreboard zelf. */}
      {/* Automatisch wedstrijdverslag: het napraatmoment in woorden, meteen deelbaar. */}
      {report && (
        <section className="match-report" aria-label="Wedstrijdverslag">
          <h2 className="match-report-headline">{report.headline}</h2>
          <p className="match-report-lead">{report.lead}</p>
          {report.paragraphs.map((p, i) => (
            <p key={i} className="match-report-p">
              {p}
            </p>
          ))}
          <p className="match-report-note">Automatisch samengesteld uit de geregistreerde wedstrijddata.</p>
        </section>
      )}

      {state.match.status === 'finished' && <WinfieCard matchId={matchId} />}

      {share && (
        <>
          <MatchRecap stats={share.stats} teams={{ home: state.teams.home.name, away: state.teams.away.name }} branding={state.teams} />
          <MatchScorers
            players={share.stats.players}
            teams={{ home: state.teams.home.name, away: state.teams.away.name }}
            colors={{ home: state.teams.home.colors?.primary ?? null, away: state.teams.away.colors?.primary ?? null }}
          />
          {/* Publieke shot map: voorheen enkel achter de analyse-login. Het virale napraat-moment. */}
          {share.shots.length > 0 && (
            <MatchStats
              stats={share.stats}
              shots={share.shots}
              teams={{ home: state.teams.home.name, away: state.teams.away.name }}
              goalAreaDepth={(matchDoc as { goalAreaDepth?: number } | null)?.goalAreaDepth ?? undefined}
              speelveldM={(matchDoc as { veldSpeelveld?: number | null } | null)?.veldSpeelveld ?? undefined}
              matchLabel={`${share.reeks}${share.datum ? ` · ${share.datum}` : ''}`}
            />
          )}
        </>
      )}

      {/* Rechtzetten van wat de import fout had: het aanvangsuur en de ploegnaam/club. Enkel voor
          de federatie, en enkel op een competitiewedstrijd (analysewedstrijden hebben hun eigen
          beheer). Staat onderaan: het is gereedschap, geen deel van de wedstrijd zelf. */}
      {magBeheren && beheerThuis && beheerUit && (
        <WedstrijdBeheer
          matchId={matchId}
          datumIso={matchDatum}
          thuis={beheerThuis}
          uit={beheerUit}
          clubs={clubKeuze}
        />
      )}
      </div>
    </>
  )
}
