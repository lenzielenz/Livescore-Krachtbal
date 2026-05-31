import Link from 'next/link'
import { notFound } from 'next/navigation'

import { MatchStats } from '@/components/MatchStats'
import { Scoreboard } from '@/components/Scoreboard'
import { buildMatchState, buildMatchStats, buildTimeline } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'

export const dynamic = 'force-dynamic'

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) notFound()

  const payload = await getPayloadClient()
  let state, timeline, stats
  try {
    ;[state, timeline, stats] = await Promise.all([
      buildMatchState(payload, matchId),
      buildTimeline(payload, matchId),
      buildMatchStats(payload, matchId),
    ])
  } catch {
    notFound()
  }

  return (
    <div className="site">
      <Link href="/" className="back-link">
        ← Alle wedstrijden
      </Link>
      <Scoreboard matchId={matchId} initial={{ state, timeline }} />
      <p className="sheet-cta">
        <Link href={`/match/${matchId}/sheet`} className="back-link">
          📋 Wedstrijdblad (print / PDF / JSON)
        </Link>
      </p>
      <MatchStats stats={stats.stats} shots={stats.shots} teams={{ home: state.teams.home.name, away: state.teams.away.name }} goalAreaDepth={state.match.goalAreaDepth} />
    </div>
  )
}
