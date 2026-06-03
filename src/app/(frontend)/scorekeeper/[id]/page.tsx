import { headers } from 'next/headers'
import { notFound } from 'next/navigation'

import { isFederationLevel } from '@/lib/access'
import { buildMatchState } from '@/lib/match-engine'
import { getMatchReadiness } from '@/lib/matchsheet-data'
import { resolveMatchPackage } from '@/lib/packages'
import { getPayloadClient } from '@/lib/payload-client'
import { Scorekeeper } from './Scorekeeper'
import { SimpleScorekeeper } from './SimpleScorekeeper'
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

  // Pakket van de thuisclub bepaalt het aantekenmodel. Starter → snel scoren
  // (+1/+2 zonder veldschema); Team/Elite → het volledige veldscherm.
  // De demo toont altijd het volledige veldscherm (met tutorial), ongeacht pakket.
  const matchDoc = await payload.findByID({ collection: 'matches', id: matchId, depth: 2 }).catch(() => null)
  const pkg = resolveMatchPackage(matchDoc)
  if (pkg.scoringMode === 'simple' && !matchDoc?.isDemo) {
    return <SimpleScorekeeper matchId={matchId} initialState={state} />
  }

  const [players, readiness, auth] = await Promise.all([
    payload.find({
      collection: 'players',
      where: { team: { in: [state.teams.home.id, state.teams.away.id] } },
      sort: 'shirtNumber',
      depth: 0,
      limit: 200,
    }),
    getMatchReadiness(payload, matchId),
    payload.auth({ headers: await headers() }).catch(() => ({ user: null })),
  ])

  const roster = players.docs.map((p) => ({
    id: p.id,
    name: p.name,
    shirtNumber: p.shirtNumber,
    teamId: typeof p.team === 'object' ? p.team.id : p.team,
  }))

  return (
    <Scorekeeper
      matchId={matchId}
      initialState={state}
      roster={roster}
      readiness={readiness}
      isAdmin={isFederationLevel(auth.user)}
    />
  )
}
