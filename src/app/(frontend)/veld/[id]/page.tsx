import { notFound } from 'next/navigation'

import { buildMatchState, buildTimeline } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'
import { FieldScreen } from './FieldScreen'
import './veld.css'

export const dynamic = 'force-dynamic'

// Veldscherm: fullscreen scorebord voor het grote scherm aan het veld. Eén vaste wedstrijd
// per URL (/veld/[id]). Toont de stand live via SSE en speelt een doelpunt-animatie af.
export default async function VeldPage({ params }: { params: Promise<{ id: string }> }) {
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

  const matchDoc = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  // Analysewedstrijden zijn privé en horen niet op het publieke veld-/tv-scherm.
  if (matchDoc?.analyseOnly) notFound()
  const reeks = matchDoc?.reeks ? reeksNaam(matchDoc.reeks) : null

  return <FieldScreen matchId={matchId} reeks={reeks} initial={{ state, timeline }} />
}
