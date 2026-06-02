import { notFound } from 'next/navigation'

import { getPayloadClient } from '@/lib/payload-client'
import { buildTournamentState } from '@/lib/tournament-engine'
import { TournamentKantine } from './TournamentKantine'
import '../../tornooi.css'

export const dynamic = 'force-dynamic'

// Kantinescherm: de volledige boomstructuur + de live score van de wedstrijden die bezig zijn.
export default async function KantinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tournamentId = Number(id)
  if (!Number.isFinite(tournamentId)) notFound()

  const payload = await getPayloadClient()
  let state
  try {
    state = await buildTournamentState(payload, tournamentId)
  } catch {
    notFound()
  }

  return <TournamentKantine id={tournamentId} initial={state} />
}
