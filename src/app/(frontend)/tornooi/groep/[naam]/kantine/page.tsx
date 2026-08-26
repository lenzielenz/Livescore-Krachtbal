import { notFound } from 'next/navigation'

import { getPayloadClient } from '@/lib/payload-client'
import { loadGroepData } from '@/lib/tornooi-groep'
import { GroepKantine } from './GroepKantine'
import '../../../tornooi.css'

export const dynamic = 'force-dynamic'

// Kantinescherm van een hele tornooidag: één link die de hele dag open blijft staan en zichzelf
// aanpast (aftellen → live borden → eindstand). De eerste momentopname komt van de server; daarna
// houdt de client zichzelf bij via de groep-API.
export default async function GroepKantinePage({ params }: { params: Promise<{ naam: string }> }) {
  const { naam: ruw } = await params
  const naam = decodeURIComponent(ruw).trim()
  if (!naam) notFound()

  const payload = await getPayloadClient()
  const data = await loadGroepData(payload, naam)
  if (!data) notFound()

  return <GroepKantine naam={naam} initial={data} />
}
