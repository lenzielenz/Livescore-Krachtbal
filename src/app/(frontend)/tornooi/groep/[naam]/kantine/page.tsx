import { notFound } from 'next/navigation'

import { isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { loadGroepData } from '@/lib/tornooi-groep'
import { GroepKantine } from './GroepKantine'
import '../../../tornooi.css'

export const dynamic = 'force-dynamic'

// Kantinescherm van een hele tornooidag: één link die de hele dag open blijft staan en zichzelf
// aanpast (aftellen → live borden → eindstand → sfeerbeelden). De eerste momentopname komt van de
// server; daarna houdt de client zichzelf bij via de groep-API.
//
// De pagina blijft publiek. Enkel het foto-archief hangt aan een sessie: staat de tv ingelogd als
// federatie (zoals de organisatie hem opzet), dan draait er na afloop een fotoshow. Zonder die
// sessie is het scherm exact wat het altijd was — de foto's van supporters horen niet aan de
// openbare weg te hangen omdat iemand de link kent.
export default async function GroepKantinePage({ params }: { params: Promise<{ naam: string }> }) {
  const { naam: ruw } = await params
  const naam = decodeURIComponent(ruw).trim()
  if (!naam) notFound()

  const payload = await getPayloadClient()
  const archief = isFederationLevel(await getAuthUser())
  const data = await loadGroepData(payload, naam, { archief })
  if (!data) notFound()

  return <GroepKantine naam={naam} initial={data} />
}
