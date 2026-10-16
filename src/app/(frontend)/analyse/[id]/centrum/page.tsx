import { notFound, redirect } from 'next/navigation'

import { canViewAnalyseMatch } from '@/lib/analyse-access'
import { leesManifest } from '@/lib/app-analyse'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'

import { CentrumScherm } from '../CentrumScherm'

export const dynamic = 'force-dynamic'

// Het wedstrijdcentrum van de app, schermvullend, voor wie de analyse mag zien.
export default async function CentrumPagina({ params }: { params: Promise<{ id: string }> }) {
  const matchId = Number((await params).id)
  if (!Number.isInteger(matchId)) notFound()
  const me = await getAuthUser()
  if (!me) redirect(`/inloggen?next=${encodeURIComponent(`/analyse/${matchId}/centrum`)}`)
  const payload = await getPayloadClient()
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 1 }).catch(() => null)
  if (!match || !match.analyseOnly || !canViewAnalyseMatch(me, match as { analyseOnly?: boolean | null; analyseOwner?: unknown })) {
    notFound()
  }
  const manifest = await leesManifest(matchId)
  if (!manifest?.bestanden.some((b) => b.naam === 'wedstrijdcentrum.html')) redirect(`/analyse/${matchId}`)
  const naam = (t: unknown) => (t && typeof t === 'object' ? String((t as { name?: unknown }).name ?? '') : '')
  return (
    <CentrumScherm matchId={matchId} titel={`${naam(match.homeTeam)} – ${naam(match.awayTeam)}`} terugHref={`/analyse/${matchId}`} />
  )
}
