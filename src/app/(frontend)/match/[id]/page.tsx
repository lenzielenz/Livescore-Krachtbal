import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Scoreboard } from '@/components/Scoreboard'
import { buildMatchState, buildTimeline } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'

export const dynamic = 'force-dynamic'

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) notFound()

  const payload = await getPayloadClient()
  let state, timeline
  try {
    ;[state, timeline] = await Promise.all([buildMatchState(payload, matchId), buildTimeline(payload, matchId)])
  } catch {
    notFound()
  }

  return (
    <div className="site">
      <Link href="/" className="back-link">
        ← Alle wedstrijden
      </Link>
      <Scoreboard matchId={matchId} initial={{ state, timeline }} />
    </div>
  )
}
