import Link from 'next/link'
import { notFound } from 'next/navigation'

import { SiteHeader } from '@/components/SiteHeader'
import { TeamLogo } from '@/components/TeamLogo'
import { canAnalyse } from '@/lib/access'
import { canViewAnalyseMatch } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { buildMatchSheet, buildMatchStats, buildMatchState } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'
import { AnalyseDetailView } from './AnalyseDetailView'
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

  const sheet = await buildMatchSheet(payload, matchId).catch(() => null)
  const momentumGoals = (sheet?.goals ?? [])
    .slice()
    .sort((a, b) => a.half - b.half || a.gameClock - b.gameClock)
    .map((g) => ({ side: g.side, points: g.points, half: g.half }))

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

        <AnalyseDetailView
          stats={stats.stats}
          shots={stats.shots}
          teams={teamNames}
          goalAreaDepth={state.match.goalAreaDepth}
          momentumGoals={momentumGoals}
        />
      </div>
    </>
  )
}
