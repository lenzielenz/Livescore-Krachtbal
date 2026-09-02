import { notFound, redirect } from 'next/navigation'

import { isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { Slideshow, type SlideFoto } from './Slideshow'

export const dynamic = 'force-dynamic'

// De foto's van een tornooidag als doorlopende slideshow op het kantinescherm — voor ná het
// tornooi, wanneer iedereen nog nazit. Zelfde kring als het archief: enkel de federatie, want de
// foto's zijn bewust niet publiek (zie collections/TornooiFotos.ts).
export default async function SlideshowPage({ params }: { params: Promise<{ naam: string }> }) {
  const { naam: ruw } = await params
  const naam = decodeURIComponent(ruw).trim()
  if (!naam) notFound()

  const user = await getAuthUser()
  if (!isFederationLevel(user)) redirect(`/tornooi/groep/${encodeURIComponent(naam)}`)

  const payload = await getPayloadClient()
  const res = await payload
    .find({ collection: 'tornooi-fotos', where: { groep: { equals: naam } }, sort: 'createdAt', depth: 0, limit: 500 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))

  const fotos: SlideFoto[] = (res.docs as { id: number; uploaderName?: string | null; opdracht?: string | null }[])
    .map((f) => ({
      id: f.id,
      // Altijd via de eigen route: die kent het onderscheid tussen het kantinescherm (enkel
      // verse foto's) en de federatie (het hele archief).
      src: `/api/tornooi-groep/foto/${f.id}?naam=${encodeURIComponent(naam)}`,
      uploaderName: f.uploaderName || '',
      opdracht: f.opdracht || null,
    }))

  return <Slideshow naam={naam} fotos={fotos} />
}
