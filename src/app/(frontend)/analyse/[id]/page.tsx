import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ErrorCatch } from '@/components/ErrorCatch'
import { SiteHeader } from '@/components/SiteHeader'
import { TeamLogo } from '@/components/TeamLogo'
import { canAnalyse } from '@/lib/access'
import { canViewAnalyseMatch } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { buildDefenseStats, buildMatchSheet, buildMatchStats, buildMatchState, buildPassStats } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksHalfDurationSeconds, reeksNaam, type Reeks } from '@/lib/reeksen'
import { mayEditMatchVideo } from '@/lib/video-access'
import { AnalyseDetailView } from './AnalyseDetailView'
import { ShareCard } from './ShareCard'
import { VideoAnalyse, type VideoMoment } from './VideoAnalyse'
import '../analyse.css'

export const dynamic = 'force-dynamic'

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

  const defense = await buildDefenseStats(payload, matchId).catch(() => [])
  const passen = await buildPassStats(payload, matchId).catch(() => null)
  const sheet = await buildMatchSheet(payload, matchId).catch(() => null)
  const momentumGoals = (sheet?.goals ?? [])
    .slice()
    .sort((a, b) => a.half - b.half || a.gameClock - b.gameClock)
    .map((g) => ({ side: g.side, points: g.points, half: g.half, gameClock: g.gameClock }))

  // Time-outs (gevraagde minuten) voor verticale lijnen op het scoreverloop.
  const toRes = await payload
    .find({ collection: 'match-events', where: { and: [{ match: { equals: matchId } }, { type: { equals: 'timeout' } }] }, depth: 0, limit: 100 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
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
  const halfSeconds = reeksHalfDurationSeconds(matchDoc?.reeks as Reeks)
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

        <ErrorCatch label="De video-analyse">
          <VideoAnalyse
            matchId={matchId}
            initialUrl={(matchDoc?.videoUrl as string | null) ?? null}
            initialOffsetH1={(matchDoc?.videoOffsetH1 as number | null) ?? null}
            initialOffsetH2={(matchDoc?.videoOffsetH2 as number | null) ?? null}
            moments={videoMoments}
            halfSeconds={halfSeconds}
            teams={teamNames}
            canEdit={mayEditVideo}
          />
        </ErrorCatch>

        <ErrorCatch label="De analyse-details">
          <AnalyseDetailView
            stats={stats.stats}
            shots={stats.shots}
            teams={teamNames}
            goalAreaDepth={state.match.goalAreaDepth}
            momentumGoals={momentumGoals}
            momentumTimeouts={momentumTimeouts}
            teamColors={teamColors}
            matchLabel={[reeks, datum].filter(Boolean).join(' · ')}
          />
        </ErrorCatch>
      </div>
    </>
  )
}
