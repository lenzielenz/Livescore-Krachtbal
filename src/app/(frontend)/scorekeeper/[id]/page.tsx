import { notFound } from 'next/navigation'

import { buildMatchState } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { Scorekeeper } from './Scorekeeper'
import './scorekeeper.css'

export const dynamic = 'force-dynamic'

export default async function ScorekeeperPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) notFound()

  const payload = await getPayloadClient()

  let state
  try {
    state = await buildMatchState(payload, matchId)
  } catch {
    notFound()
  }

  const players = await payload.find({
    collection: 'players',
    where: { team: { in: [state.teams.home.id, state.teams.away.id] } },
    sort: 'shirtNumber',
    depth: 0,
    limit: 200,
  })

  const roster = players.docs.map((p) => ({
    id: p.id,
    name: p.name,
    shirtNumber: p.shirtNumber,
    teamId: typeof p.team === 'object' ? p.team.id : p.team,
  }))

  return <Scorekeeper matchId={matchId} initialState={state} roster={roster} />
}
