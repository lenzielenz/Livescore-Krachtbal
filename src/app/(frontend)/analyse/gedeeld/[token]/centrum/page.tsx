import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { leesManifest, wedstrijdVanDeelToken } from '@/lib/app-analyse'
import { getPayloadClient } from '@/lib/payload-client'

import { CentrumScherm } from '../../../[id]/CentrumScherm'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Wedstrijdcentrum', robots: { index: false, follow: false } }

// Het wedstrijdcentrum schermvullend, via een deellink (geen account nodig).
export default async function GedeeldCentrum({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const matchId = await wedstrijdVanDeelToken(token)
  if (matchId == null) notFound()
  const manifest = await leesManifest(matchId)
  if (!manifest?.bestanden.some((b) => b.naam === 'wedstrijdcentrum.html')) notFound()
  const payload = await getPayloadClient()
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 1 }).catch(() => null)
  if (!match?.analyseOnly) notFound()
  const naam = (t: unknown) => (t && typeof t === 'object' ? String((t as { name?: unknown }).name ?? '') : '')
  return (
    <CentrumScherm matchId={matchId} titel={`${naam(match.homeTeam)} – ${naam(match.awayTeam)}`} terugHref={`/analyse/gedeeld/${token}`} />
  )
}
