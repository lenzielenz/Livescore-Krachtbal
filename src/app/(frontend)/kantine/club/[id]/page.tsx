import { notFound } from 'next/navigation'

import { getPayloadClient } from '@/lib/payload-client'
import { KantineScreen } from '../../KantineScreen'
import '../../kantine.css'

export const dynamic = 'force-dynamic'

// Vaste, openbare kantine-link voor één club: toont AL hun wedstrijden van vandaag (dynamisch, de
// inhoud beweegt mee per week) op het kantinescherm. De link blijft heel het seizoen geldig.
export default async function KantineClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const clubId = Number(id)
  if (!Number.isFinite(clubId)) notFound()

  const payload = await getPayloadClient()
  const club = await payload.findByID({ collection: 'clubs', id: clubId, depth: 0 }).catch(() => null)
  if (!club) notFound()

  return <KantineScreen endpoint={`/api/kantine/club/${clubId}`} editable={false} title={String((club as { name?: unknown }).name ?? '')} />
}
