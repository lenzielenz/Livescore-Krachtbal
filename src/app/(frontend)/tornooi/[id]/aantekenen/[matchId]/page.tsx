import { notFound } from 'next/navigation'

import { getPayloadClient } from '@/lib/payload-client'
import { buildTournamentState } from '@/lib/tournament-engine'
import { TournamentScoresheet } from './TournamentScoresheet'
import '../../../tornooi.css'

export const dynamic = 'force-dynamic'

// Aantekentafel: snelle score-invoer voor één tornooiwedstrijd (tablet bij het veld).
export default async function AantekenenPage({ params }: { params: Promise<{ id: string; matchId: string }> }) {
  const { id, matchId } = await params
  const tournamentId = Number(id)
  const mId = Number(matchId)
  if (!Number.isFinite(tournamentId) || !Number.isFinite(mId)) notFound()

  const payload = await getPayloadClient()
  let state
  try {
    state = await buildTournamentState(payload, tournamentId)
  } catch {
    notFound()
  }
  const exists = [...state.rounds.flatMap((r) => r.matches), state.thirdPlace].some((m) => m && m.id === mId)
  if (!exists) notFound()

  return <TournamentScoresheet id={tournamentId} matchId={mId} initial={state} halfDurationSeconds={state.halfDurationSeconds} />
}
