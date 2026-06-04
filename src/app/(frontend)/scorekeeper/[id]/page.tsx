import { notFound } from 'next/navigation'

import { hasRole } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { buildMatchState } from '@/lib/match-engine'
import { getMatchReadiness } from '@/lib/matchsheet-data'
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

  const matchDoc = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)

  // Aantekenmodel volgt de rol: enkel een admin krijgt de volledige scoreopnemer
  // (3-staps veldschema). Iedereen anders tekent aan met de basis snelscoremodus.
  const user = await getAuthUser()
  const isAdmin = hasRole(user, 'admin')

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

  // Niet-admins tekenen aan met de basis snelscoremodus (+1/+2 zonder veldschema).
  // De demo toont altijd het volledige veldscherm (met tutorial) om te oefenen.
  if (!isAdmin && !matchDoc?.isDemo) {
    return <SimpleScorekeeper matchId={matchId} initialState={state} roster={roster} />
  }

  const readiness = await getMatchReadiness(payload, matchId)

  return (
    <Scorekeeper
      matchId={matchId}
      initialState={state}
      roster={roster}
      readiness={readiness}
      isAdmin={isAdmin}
    />
  )
}
