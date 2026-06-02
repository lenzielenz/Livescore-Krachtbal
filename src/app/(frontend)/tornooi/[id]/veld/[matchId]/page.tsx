import { notFound } from 'next/navigation'

import { getPayloadClient } from '@/lib/payload-client'
import { buildTournamentState } from '@/lib/tournament-engine'
import { TournamentFieldScreen } from './TournamentFieldScreen'
import '../../../tornooi.css'

export const dynamic = 'force-dynamic'

// Veldscherm: fullscreen scorebord voor het grote scherm aan het veld (één wedstrijd).
export default async function VeldPage({ params }: { params: Promise<{ id: string; matchId: string }> }) {
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

  return <TournamentFieldScreen id={tournamentId} matchId={mId} initial={state} />
}
