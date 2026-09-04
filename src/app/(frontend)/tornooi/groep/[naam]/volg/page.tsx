import { notFound } from 'next/navigation'

import { SiteHeader } from '@/components/SiteHeader'
import { magTornooiAantekenen } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { isSupportersMode } from '@/lib/score-mode'
import { loadGroepData } from '@/lib/tornooi-groep'
import { VolgScherm } from './VolgScherm'
import '../../../tornooi.css'
import './volg.css'

export const dynamic = 'force-dynamic'

/**
 * De tornooidag volgen op je gsm.
 *
 * Het kantinescherm doet dit al schitterend, maar dat is gemaakt voor een tv in de hoek van de
 * zaal: liggend, van vijf meter leesbaar, met een fotoshow en een castknop. Een supporter langs
 * het veld heeft iets anders nodig — rechtstaand, in één duim te scrollen, en zonder de meubels
 * die alleen op een tv thuishoren.
 *
 * Dit is die versie: wat er nú speelt bovenaan, wat eraan komt eronder, en daaronder alles wat al
 * gespeeld is. Publiek, want een supporter hoort hier niet voor te moeten inloggen.
 */
export default async function VolgPage({ params }: { params: Promise<{ naam: string }> }) {
  const { naam: ruw } = await params
  const naam = decodeURIComponent(ruw).trim()
  if (!naam) notFound()

  const payload = await getPayloadClient()
  const data = await loadGroepData(payload, naam)
  if (!data) notFound()

  // Mag deze bezoeker meetellen? Dan krijgt hij bij een lopende wedstrijd dezelfde aantekenknop
  // als elders — één regel voor de knoppen én voor de server, zodat er nooit een knop staat die
  // daarna geweigerd wordt.
  const magScoren = magTornooiAantekenen(await getAuthUser(), await isSupportersMode(payload))

  return (
    <>
      <SiteHeader active="tornooi" />
      <VolgScherm naam={naam} initial={data} magScoren={magScoren} />
    </>
  )
}
