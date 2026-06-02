import { notFound } from 'next/navigation'

import { getPayloadClient } from '@/lib/payload-client'
import { buildTournamentState } from '@/lib/tournament-engine'
import { BracketBoard } from './BracketBoard'
import '../tornooi.css'

export const dynamic = 'force-dynamic'

// Boomstructuur van een tornooi: alle rondes naast elkaar, live via SSE. Vanuit elke wedstrijd kun
// je de aantekentafel of het veldscherm openen; bovenaan de link naar het kantinescherm.
export default async function TornooiPage({ params }: { params: Promise<{ id: string }> }) {
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

  return <BracketBoard id={tournamentId} initial={state} />
}
