import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ErrorCatch } from '@/components/ErrorCatch'
import { SiteHeader } from '@/components/SiteHeader'
import { TeamLogo } from '@/components/TeamLogo'
import { canAnalyse, isFederationLevel } from '@/lib/access'
import { canViewAnalyseMatch } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { leesToewijzing } from '@/lib/cv-werpers'
import { buildDefenseStats, buildMatchSheet, buildMatchStats, buildMatchState, buildPassStats } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksHalfDurationSeconds, reeksNaam, type Reeks } from '@/lib/reeksen'
import { readSync } from '@/lib/video-sync'
import { mayEditMatchVideo } from '@/lib/video-access'
import { AnalyseDetailView, type FysiekSpeler } from './AnalyseDetailView'
import type { CvVoorstel } from './CvReview'
import { CvVeldkaart } from './CvVeldkaart'
import { ShareCard } from './ShareCard'
import { AnalyseVoortgang, type VoortgangInput } from './AnalyseVoortgang'
import { Kalibreren } from './Kalibreren'
import { ModelBijstellen } from './ModelBijstellen'
import { ModelScore } from './ModelScore'
import { Overzetten } from './Overzetten'
import { Sporen } from './Sporen'
import { Werpers } from './Werpers'
import { ServerAnalyse } from './ServerAnalyse'
import { Terreinmaten } from './Terreinmaten'
import { Veldkaart } from './Veldkaart'
import { VideoAnalyse, type VideoMoment, type VideoWorp } from './VideoAnalyse'
import '../analyse.css'

export const dynamic = 'force-dynamic'

type VoortgangStatus = NonNullable<VoortgangInput['analyseStatus']>

export default async function AnalyseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getAuthUser()
  if (!canAnalyse(me)) {
    return (
      <>
        <SiteHeader active="analyse" />
        <div className="site">
          <h1 className="page-title"><span className="brand">Analyse</span></h1>
          <p className="empty">
            Je hebt geen toegang tot de analyse.{' '}
            <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
          </p>
        </div>
      </>
    )
  }

  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) notFound()

  const payload = await getPayloadClient()
  // Privé per persoon: een analyse-opname van iemand anders mag je niet bekijken (federatie wel).
  const matchDoc = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  if (!matchDoc) notFound()
  if (!canViewAnalyseMatch(me, matchDoc as { analyseOnly?: boolean | null; analyseOwner?: unknown })) {
    return (
      <>
        <SiteHeader active="analyse" />
        <div className="site">
          <h1 className="page-title"><span className="brand">Analyse</span></h1>
          <p className="empty">
            Deze analyse hoort bij een andere gebruiker. Je ziet enkel je eigen analyse-opnames.{' '}
            <Link href="/analyse" style={{ color: 'var(--accent)' }}>← Naar mijn analyses</Link>
          </p>
        </div>
      </>
    )
  }

  let state, stats
  try {
    ;[state, stats] = await Promise.all([buildMatchState(payload, matchId), buildMatchStats(payload, matchId)])
  } catch {
    notFound()
  }

  // Deze zes bevragingen hangen niet van elkaar af: samen ophalen scheelt evenveel
  // round-trips als er queries zijn (op Postgres merkbaar bij elke paginalading).
  // De CV-voorstellen zijn enkel voor federatie-niveau — anders halen we ze niet op.
  const [defense, passen, sheet, toRes, worpenRes, cvRes] = await Promise.all([
    buildDefenseStats(payload, matchId).catch(() => []),
    buildPassStats(payload, matchId).catch(() => null),
    buildMatchSheet(payload, matchId).catch(() => null),
    payload
      .find({ collection: 'match-events', where: { and: [{ match: { equals: matchId } }, { type: { equals: 'timeout' } }] }, depth: 0, limit: 100 })
      .catch(() => ({ docs: [] as Record<string, unknown>[] })),
    payload
      .find({ collection: 'throws', where: { match: { equals: matchId } }, sort: 'createdAt', depth: 1, limit: 2000 })
      .catch(() => ({ docs: [] as Record<string, unknown>[] })),
    isFederationLevel(me)
      ? payload
          .find({ collection: 'cv-events', where: { match: { equals: matchId } }, sort: 'videoTimeS', depth: 0, limit: 2000 })
          .catch(() => null)
      : Promise.resolve(null),
  ])
  // Fysieke stats uit de videotracking (cv/fysiek.py → /api/cv/match/[id]/fysiek), indien geüpload.
  const fysiekRaw = (matchDoc.cvFysiek as { spelers?: unknown[] } | null | undefined)?.spelers
  const fysiek = Array.isArray(fysiekRaw)
    ? (fysiekRaw.filter(
        (f): f is FysiekSpeler =>
          !!f && typeof f === 'object' && 'rugnummer' in f && 'afstand_m' in f && 'sprints' in f,
      ) as FysiekSpeler[])
    : []
  const momentumGoals = (sheet?.goals ?? [])
    .slice()
    .sort((a, b) => a.half - b.half || a.gameClock - b.gameClock)
    .map((g) => ({ side: g.side, points: g.points, half: g.half, gameClock: g.gameClock }))

  // Time-outs (gevraagde minuten) voor verticale lijnen op het scoreverloop.
  const homeTeamId = state.teams.home.id
  const momentumTimeouts = toRes.docs.map((e) => {
    const tId = (e as { team?: unknown }).team
    const teamId = tId && typeof tId === 'object' ? Number((tId as { id?: number }).id) : Number(tId)
    return {
      side: (teamId === homeTeamId ? 'home' : 'away') as 'home' | 'away',
      half: Number((e as { half?: unknown }).half ?? 1),
      gameClock: Number((e as { gameClock?: unknown }).gameClock ?? 0),
    }
  })
  const teamColors = { home: state.teams.home.colors?.primary ?? null, away: state.teams.away.colors?.primary ?? null }

  // ── Video-analyse: de doelpunten als springpunten in de opname ──
  // Elk doelpunt kent zijn helft + wedstrijdklok; met de ijkpunten op de wedstrijd (videoOffsetH1/H2)
  // springt de speler daarmee naar het juiste beeld (zie src/lib/video-sync.ts).
  const videoMoments: VideoMoment[] = (sheet?.goals ?? [])
    .slice()
    .sort((a, b) => a.half - b.half || a.gameClock - b.gameClock)
    .map((g) => ({
      half: g.half,
      gameClock: g.gameClock,
      side: g.side,
      label: `${g.shirtNumber} ${g.playerName.split(/\s+/)[0]} · ${g.type === 'rug' ? 'rugworp' : 'nekworp'}`,
      points: g.points,
    }))
  // Alle worpen (immutable events, hier enkel gelezen) voor de tijdlijnbalk onder de video:
  // elke manuele tag op zijn videotijd, zodat je ziet of de ijking klopt vóór er ooit een
  // CV-voorstel bijkomt (fase 0).
  // Worpen die uit de video zijn afgespeeld tellen NIET mee als "wat de aantekenaar invoerde".
  // Zouden ze dat wel doen, dan vergelijkt de modelscore het model met zijn eigen voorstellen en
  // meldt ze altijd 100% gevonden — het vleiendste cijfer dat je kunt verzinnen, en het zegt niets.
  const handWorpen = worpenRes.docs.filter((t) => (t as { bron?: string }).bron !== 'video')
  const videoWorpen: VideoWorp[] = worpenRes.docs
    .map((t) => {
      const d = t as { team?: unknown; player?: unknown; period?: unknown; gameClock?: unknown; type?: unknown; outcome?: unknown }
      const teamId = d.team && typeof d.team === 'object' ? Number((d.team as { id?: number }).id) : Number(d.team)
      const speler = d.player && typeof d.player === 'object' ? (d.player as { shirtNumber?: number }) : null
      const outcome = String(d.outcome ?? '')
      return {
        half: Number(d.period ?? 1),
        gameClock: Number(d.gameClock ?? 0),
        side: (teamId === homeTeamId ? 'home' : 'away') as 'home' | 'away',
        worpType: (d.type === 'rug' ? 'rug' : 'nek') as 'nek' | 'rug',
        uitkomst:
          outcome === 'goal' || outcome === 'own_goal'
            ? ('doelpunt' as const)
            : outcome === 'caught'
              ? ('vangst' as const)
              : null,
        shirtNumber: speler?.shirtNumber ?? 0,
      }
    })
    .sort((a, b) => a.half - b.half || a.gameClock - b.gameClock)
  const halfSeconds = reeksHalfDurationSeconds(matchDoc?.reeks as Reeks)
  // Wat er al aangeduid is op het veld: het aantal kruisingen bepaalt of er überhaupt gemeten
  // kan worden (4 is het minimum voor een homografie), en over hoeveel beelden ze verdeeld staan.
  const kal = (matchDoc?.cvKalibratie ?? null) as
    | { punten?: unknown[]; beelden?: { punten?: unknown[] }[] }
    | null
  const kalibratieBeelden = Array.isArray(kal?.beelden) ? kal.beelden.length : 0
  // Vier punten óp hetzelfde beeld is wat een homografie nodig heeft; vier punten verdeeld over
  // vier beelden is niets waard. Daarom telt dit apart.
  const kalibratieBruikbareBeelden = Array.isArray(kal?.beelden)
    ? kal.beelden.filter((b) => (Array.isArray(b?.punten) ? b.punten.length : 0) >= 4).length
    : Array.isArray(kal?.punten) && kal.punten.length >= 4
      ? 1
      : 0
  const kalibratiePunten = Array.isArray(kal?.beelden)
    ? new Set(
        kal.beelden.flatMap((b) =>
          (Array.isArray(b?.punten) ? b.punten : []).map((pt) => String((pt as { label?: string })?.label ?? '')),
        ),
      ).size
    : Array.isArray(kal?.punten)
      ? kal.punten.length
      : 0
  // ── CV-voorstellen (fase 1): kandidaat-events uit de computer-vision-pipeline ──
  // Enkel federatie-niveau ziet en reviewt ze — supporters en analyse-gasten krijgen géén
  // voorstellen mee (het zijn onbevestigde modelclaims, geen wedstrijdfeiten). De review-UI
  // muteert uitsluitend via PATCH /api/cv/events/[id] (zie CvReview.tsx).
  const cvVoorstellen: CvVoorstel[] = (cvRes?.docs ?? []).map((e) => ({
    id: e.id,
    videoTimeS: e.videoTimeS,
    eventType: e.eventType,
    worpType: e.worpType ?? null,
    confidence: e.confidence,
    reviewed: e.reviewed === true,
    verdict: e.verdict ?? null,
    side: e.side ?? null,
    rugnummer: e.rugnummer ?? null,
    inDoelgebied: e.inDoelgebied === true,
    uitbal: e.uitbal === true,
    xM: e.xM ?? null,
    yM: e.yM ?? null,
    afstandM: e.afstandM ?? null,
    richtingGraden: e.richtingGraden ?? null,
    camera: e.camera ?? null,
    vangerSide: e.vangerSide ?? null,
    vangerRugnummer: e.vangerRugnummer ?? null,
    werper: e.werper ?? null,
  }))
  // Spelers van beide ploegen, voor de landingskaart (per werper filteren op naam). Vóór het
  // overzetten heeft stats.players nog niemand — de opstelling komt dus uit de ploegen zelf.
  const cvKaartSpelers =
    cvVoorstellen.length > 0
      ? (
          await payload
            .find({
              collection: 'players',
              where: { team: { in: [state.teams.home.id, state.teams.away.id] } },
              depth: 0,
              limit: 400,
            })
            .catch(() => ({ docs: [] as Record<string, unknown>[] }))
        ).docs.map((p) => {
          const teamId = p.team && typeof p.team === 'object' ? Number((p.team as { id: number }).id) : Number(p.team)
          return {
            playerId: Number((p as { id: number }).id),
            playerName: String((p as { name?: unknown }).name ?? ''),
            shirtNumber: Number((p as { shirtNumber?: unknown }).shirtNumber ?? 0),
            teamSide: (teamId === state.teams.away.id ? 'away' : 'home') as 'home' | 'away',
          }
        })
      : []
  // Video koppelen/ijken mag wie de analyse beheert: de federatie, of de eigenaar van deze
  // privé-opname (dezelfde kring die ze al mag bekijken — de paginatoegang hierboven).
  const mayEditVideo = mayEditMatchVideo(me, matchDoc as { analyseOnly?: boolean | null; analyseOwner?: unknown })

  const reeks = reeksNaam(matchDoc?.reeks)
  const datum = matchDoc?.date
    ? new Date(matchDoc.date as string).toLocaleDateString('nl-BE', { dateStyle: 'long' })
    : null
  const teamNames = { home: state.teams.home.name, away: state.teams.away.name }

  return (
    <>
      <SiteHeader active="analyse" />
      <div className="site">
        <Link href="/analyse" className="back-link">← Alle analyses</Link>

        <div className="an-head">
          <div className="an-head-team">
            <TeamLogo name={state.teams.home.name} logoUrl={state.teams.home.logoUrl} logoFit={state.teams.home.logoFit} side="home" size="md" ringColor={state.teams.home.colors?.primary} />
            <span>{state.teams.home.name}</span>
          </div>
          <div className="an-head-score">{state.score.home}<span className="an-dash">–</span>{state.score.away}</div>
          <div className="an-head-team away">
            <span>{state.teams.away.name}</span>
            <TeamLogo name={state.teams.away.name} logoUrl={state.teams.away.logoUrl} logoFit={state.teams.away.logoFit} side="away" size="md" ringColor={state.teams.away.colors?.primary} />
          </div>
        </div>
        <p className="an-head-meta">{reeks}{datum ? ` · ${datum}` : ''}</p>

        {/* Waar sta ik met deze analyse, en wat moet er nog? Bovenaan, want dat is de vraag
            waarmee je de pagina opent — met de handleiding erin voor wie ze nog niet kent. */}
        {mayEditVideo && (
          <ErrorCatch label="De analyse-voortgang">
            <AnalyseVoortgang
              matchId={matchId}
              worpen={worpenRes.docs.length}
              videoGekoppeld={Boolean(matchDoc?.videoUrl)}
              ijkH1={typeof matchDoc?.videoOffsetH1 === 'number'}
              ijkH2={typeof matchDoc?.videoOffsetH2 === 'number'}
              tweedeHelftGespeeld={videoWorpen.some((w) => w.half === 2) || state.match.currentHalf >= 2}
              fysiekSpelers={fysiek.length}
              terreinOpgemeten={state.match.veldBreedte != null || state.match.veldSpeelveld != null}
              modus={(matchDoc?.analyseModus as 'manueel' | 'video' | null) ?? 'manueel'}
              kalibratiePunten={kalibratiePunten}
              kalibratieBeelden={kalibratieBeelden}
              kalibratieBruikbareBeelden={kalibratieBruikbareBeelden}
              analyseOvergeslagen={
                ((matchDoc?.cvAnalyse as { rapport?: { overgeslagen?: string[] } } | null)?.rapport?.overgeslagen) ?? []
              }
              analyseStatus={(matchDoc?.cvAnalyse as { status?: VoortgangStatus } | null)?.status ?? null}
              analyseStand={
                ((matchDoc?.cvAnalyse as { instellingen?: { stand?: string } } | null)?.instellingen?.stand) ?? null
              }
              voorstellen={cvVoorstellen.length}
              beoordeeld={cvVoorstellen.filter((v) => v.reviewed).length}
              openVoorstellen={cvVoorstellen.filter((v) => !v.reviewed).length}
            />
          </ErrorCatch>
        )}

        {/* Sprongbalk: deze pagina is op een telefoon acht schermen lang, en video en
            terreinmaten stonden twee tot drie schermen naar beneden — vindbaar alleen als je
            wist dat ze er waren. Deze ankers brengen je er in één tik (werkt zonder JS). */}
        <nav className="an-jump" aria-label="Snel naar">
          <a href="#video" className="an-jump-btn">
            {matchDoc?.videoUrl ? '🎥 Video' : '🎥 Video koppelen'}
          </a>
          {mayEditVideo && <a href="#terreinmaten" className="an-jump-btn">📐 Terreinmaten</a>}
          <a href="#statistieken" className="an-jump-btn">📊 Statistieken</a>
        </nav>

        {/* Nog geen opname? Dan is video koppelen de hoofdtaak van deze pagina en hoort ze
            bovenaan — niet onder een veldkaart van anderhalf scherm hoog. */}
        {mayEditVideo && !matchDoc?.videoUrl && (
          <ErrorCatch label="De video-analyse">
            <VideoAnalyse
              matchId={matchId}
              initialUrl={null}
              initialUrl2={(matchDoc?.video2Url as string | null) ?? null}
              initialOffset2={(matchDoc?.video2OffsetS as number | null) ?? null}
              initialOffsetH1={(matchDoc?.videoOffsetH1 as number | null) ?? null}
              initialOffsetH2={(matchDoc?.videoOffsetH2 as number | null) ?? null}
              moments={videoMoments}
              worpen={videoWorpen}
              voorstellen={cvVoorstellen}
              halfSeconds={halfSeconds}
              teams={teamNames}
              canEdit={mayEditVideo}
              maxMb={Number(process.env.MAX_MATCH_VIDEO_MB) || 512}
            />
          </ErrorCatch>
        )}

        {/* Hét scherm van de analyse: waar valt alles en waar wordt er gevangen, per worp en per
            speler. De rest van de pagina is verdieping en staat ingeklapt. */}
        {stats.shots.length > 0 && (
          <ErrorCatch label="De veldkaart">
            <Veldkaart
              shots={stats.shots}
              spelers={stats.stats.players.map((p) => ({
                playerId: p.playerId,
                playerName: p.playerName,
                shirtNumber: p.shirtNumber,
                teamSide: p.teamSide,
              }))}
              teams={teamNames}
              goalAreaDepth={state.match.goalAreaDepth}
              speelveldM={state.match.veldSpeelveld}
              matchLabel={[reeks, datum].filter(Boolean).join(' · ')}
            />
          </ErrorCatch>
        )}

        {Boolean(matchDoc?.videoUrl) && (
        <ErrorCatch label="De video-analyse">
          <VideoAnalyse
            matchId={matchId}
            initialUrl={(matchDoc?.videoUrl as string | null) ?? null}
            initialUrl2={(matchDoc?.video2Url as string | null) ?? null}
            initialOffset2={(matchDoc?.video2OffsetS as number | null) ?? null}
            initialOffsetH1={(matchDoc?.videoOffsetH1 as number | null) ?? null}
            initialOffsetH2={(matchDoc?.videoOffsetH2 as number | null) ?? null}
            moments={videoMoments}
            worpen={videoWorpen}
            voorstellen={cvVoorstellen}
            halfSeconds={halfSeconds}
            teams={teamNames}
            canEdit={mayEditVideo}
            maxMb={Number(process.env.MAX_MATCH_VIDEO_MB) || 512}
          />
        </ErrorCatch>
        )}

        {/* Waar landen de worpen volgens de video zelf — nog vóór het overzetten. Enkel voor wie
            de voorstellen ziet (federatie): het zijn onbevestigde modelclaims. */}
        {cvVoorstellen.some((v) => v.xM != null && v.yM != null) && (
          <ErrorCatch label="De landingskaart uit de video">
            <CvVeldkaart
              voorstellen={cvVoorstellen.map((v) => ({
                id: v.id,
                videoTimeS: v.videoTimeS,
                eventType: v.eventType,
                verdict: v.verdict,
                xM: v.xM,
                yM: v.yM,
                inDoelgebied: v.inDoelgebied,
                uitbal: v.uitbal,
                afstandM: v.afstandM,
                richtingGraden: v.richtingGraden,
                werper: v.werper,
              }))}
              toewijzing={leesToewijzing(matchDoc?.cvWerpers)}
              spelers={cvKaartSpelers}
              goalAreaDepth={state.match.goalAreaDepth}
              veldBreedte={state.match.veldBreedte}
              speelveldM={state.match.veldSpeelveld}
            />
          </ErrorCatch>
        )}

        {/* De video door de server laten analyseren: worpen zoeken, bal volgen, spelers
            herkennen. Kalibratie eerst — die bepaalt of de meting ook wéét waar de bal landt. */}
        {mayEditVideo && Boolean(matchDoc?.videoUrl) && (
          <>
            <ErrorCatch label="De veldkalibratie">
              <Kalibreren
                matchId={matchId}
                videoUrl={(matchDoc?.videoUrl as string | null) ?? null}
                veldBreedte={state.match.veldBreedte ?? 14}
                veldLengte={(state.match.veldSpeelveld ?? 26) + 2 * (state.match.goalAreaDepth ?? 10)}
                initieel={
                  (matchDoc?.cvKalibratie ?? null) as React.ComponentProps<typeof Kalibreren>['initieel']
                }
              />
            </ErrorCatch>
            {/* De tweede camera staat op een andere plek en ziet dus andere kruispunten: eigen
                kalibratie, zelfde flow. Zonder deze punten weet camera 2 wél wanneer er
                geworpen wordt, maar niet wáár de bal landt. */}
            {Boolean(matchDoc?.video2Url) && (
              <ErrorCatch label="De veldkalibratie van camera 2">
                <Kalibreren
                  matchId={matchId}
                  camera={2}
                  videoUrl={(matchDoc?.video2Url as string | null) ?? null}
                  veldBreedte={state.match.veldBreedte ?? 14}
                  veldLengte={(state.match.veldSpeelveld ?? 26) + 2 * (state.match.goalAreaDepth ?? 10)}
                  initieel={
                    (matchDoc?.cvKalibratie2 ?? null) as React.ComponentProps<typeof Kalibreren>['initieel']
                  }
                />
              </ErrorCatch>
            )}
            <ErrorCatch label="De automatische video-analyse">
              <ServerAnalyse matchId={matchId} heeftVideo />
            </ErrorCatch>
            {/* De lus die het model beter maakt: de voorstellen naast de worpen die tijdens de
                wedstrijd ingevoerd werden. Pas dán weet je hoeveel het model MIST — de
                reviewlaan alleen kan dat niet zeggen. */}
            <ErrorCatch label="De score van het model">
              <ModelScore
                worpen={handWorpen.map((t) => ({
                  half: Number((t as { period?: unknown }).period ?? 1),
                  gameClock: Number((t as { gameClock?: unknown }).gameClock ?? 0),
                }))}
                voorstellen={cvVoorstellen}
                sync={readSync({ offsetH1: matchDoc?.videoOffsetH1, offsetH2: matchDoc?.videoOffsetH2 })}
                halfSeconds={halfSeconds}
                geijkt={typeof matchDoc?.videoOffsetH1 === 'number'}
              />
            </ErrorCatch>
            {/* Wie is wie: één keer per werper zeggen welke speler dat is. Staat bewust vóór het
                overzetten — daarna staan de namen vast in onwijzigbare worpen. */}
            <ErrorCatch label="Wie wierp wat">
              <Werpers matchId={matchId} />
            </ErrorCatch>

            {/* En hetzelfde voor de tracking-sporen: wie liep waar? Dit voedt de fysieke stats
                (loopafstand, sprintjes, topsnelheid) — de server herrekent ze bij elke wijziging. */}
            <ErrorCatch label="Wie liep waar">
              <Sporen matchId={matchId} />
            </ErrorCatch>

            {/* De laatste stap van de video-weg: wat je bevestigde wordt een échte worp, zodat
                de veldkaart en de statistieken hieronder eindelijk iets tonen. Enkel zinvol
                zolang er nog niets aangetekend is. */}
            <ErrorCatch label="De voorstellen in de wedstrijd zetten">
              <Overzetten matchId={matchId} alWorpen={handWorpen.length} />
            </ErrorCatch>

            {/* En de andere helft van diezelfde lus: de drempels bijstellen op alles wat er al
                geanalyseerd is. Dat bestand geldt voor élke volgende analyse op deze server —
                vandaar enkel federatie-niveau. */}
            {isFederationLevel(me) && (
              <ErrorCatch label="Het model bijstellen">
                <ModelBijstellen />
              </ErrorCatch>
            )}
          </>
        )}

        {/* De échte terreinmaten van dít veld: bepalen alle meters op deze pagina. Ingeklapt,
            maar mét de huidige maten in de samenvatting zodat je in één blik ziet waarmee er
            gerekend wordt. Enkel voor wie de wedstrijd beheert (zelfde kring als de video). */}
        {mayEditVideo && (
          <ErrorCatch label="De terreinmaten">
            <Terreinmaten
              matchId={matchId}
              initieel={{
                veldBreedte: state.match.veldBreedte ?? null,
                veldSpeelveld: state.match.veldSpeelveld ?? null,
                goalAreaDepth: state.match.goalAreaDepth,
              }}
            />
          </ErrorCatch>
        )}

        {/* Verdieping, ingeklapt: de veldkaart en de video zijn het dagelijkse werk; wie meer
            wil (grafieken, spelerstabellen, deelkaart) klapt het hieronder open. Zijn er fysieke
            stats uit de videotracking, dan staat het open: die cijfers wil je meteen zien, niet
            achter een klik die je moet raden. */}
        <details className="an-fold" id="statistieken" open={fysiek.length > 0}>
          <summary>
            📊 Alle statistieken &amp; grafieken
            {fysiek.length > 0 && <span className="an-chart-hint"> · met loopafstand, sprintjes en topsnelheid</span>}
          </summary>
          <ErrorCatch label="De analyse-details">
            <AnalyseDetailView
              stats={stats.stats}
              shots={stats.shots}
              teams={teamNames}
              goalAreaDepth={state.match.goalAreaDepth}
              speelveldM={state.match.veldSpeelveld}
              momentumGoals={momentumGoals}
              momentumTimeouts={momentumTimeouts}
              teamColors={teamColors}
              matchLabel={[reeks, datum].filter(Boolean).join(' · ')}
              defense={defense}
              fysiek={fysiek}
            />
          </ErrorCatch>
        </details>

        <details className="an-fold">
          <summary>📣 Deelkaart</summary>
        <ShareCard
          matchId={matchId}
          teams={teamNames}
          score={{ home: state.score.home, away: state.score.away }}
          colors={teamColors}
          logos={{ home: state.teams.home.logoUrl, away: state.teams.away.logoUrl }}
          goals={momentumGoals}
          players={stats.stats.players}
          reeks={reeks}
          datum={datum}
        />
        </details>

        {(defense.length > 0 || (passen && passen.totaal > 0)) && (
          <details className="an-fold">
            <summary>🛡️ Verdediging &amp; passen</summary>
        {defense.length > 0 && (
          <section className="an-recap">
            <h2 className="section-title">🛡️ Verdediging <span className="an-chart-hint">wie pakt de ballen af</span></h2>
            <div className="an-recap-cards">
              {defense.slice(0, 4).map((d) => (
                <div key={d.playerId} className={`an-recap-card side-${d.teamSide}`}>
                  <span className="an-recap-ico" aria-hidden>🧤</span>
                  <span className="an-recap-body">
                    <span className="an-recap-lbl">#{d.shirtNumber} {d.name.split(/\s+/)[0]}</span>
                    <span className="an-recap-val">{d.total} {d.total === 1 ? 'actie' : 'acties'}</span>
                    <span className="an-recap-who">{d.catches} {d.catches === 1 ? 'vangst' : 'vangsten'}{d.taps > 0 ? ` · ${d.taps} ${d.taps === 1 ? 'tik' : 'tikken'}` : ''}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {passen && passen.totaal > 0 && (
          <section className="an-recap">
            <h2 className="section-title">
              🔗 Passen <span className="an-chart-hint">wie legt het klaar (§6.10)</span>
            </h2>
            <div className="an-recap-cards">
              {passen.spelers.slice(0, 4).map((s) => (
                <div key={s.playerId} className={`an-recap-card side-${s.teamSide}`}>
                  <span className="an-recap-ico" aria-hidden>🤝</span>
                  <span className="an-recap-body">
                    <span className="an-recap-lbl">#{s.shirtNumber} {s.name.split(/\s+/)[0]}</span>
                    <span className="an-recap-val">
                      {s.aangevers > 0 ? `${s.aangevers} ${s.aangevers === 1 ? 'aangever' : 'aangevers'}` : `${s.gegeven} ${s.gegeven === 1 ? 'pass' : 'passen'}`}
                    </span>
                    <span className="an-recap-who">
                      {s.gegeven} gegeven · {s.ontvangen} ontvangen{s.fouten > 0 ? ` · ${s.fouten} voorwaarts` : ''}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            {passen.lijnen.length > 0 && (
              <p className="an-head-meta">
                Vaakste passlijnen:{' '}
                {passen.lijnen.slice(0, 3).map((l, i) => (
                  <span key={`${l.from.playerId}-${l.to.playerId}`}>
                    {i > 0 ? ' · ' : ''}#{l.from.shirtNumber} → #{l.to.shirtNumber} ({l.count}×)
                  </span>
                ))}
                {passen.fouten > 0 ? ` · ${passen.fouten} voorwaartse ${passen.fouten === 1 ? 'pass' : 'passen'} (balverlies)` : ''}
              </p>
            )}
          </section>
        )}
          </details>
        )}
      </div>
    </>
  )
}
