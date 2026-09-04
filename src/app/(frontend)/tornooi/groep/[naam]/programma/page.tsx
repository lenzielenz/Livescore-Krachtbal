import { notFound } from 'next/navigation'

import { magTornooiAantekenen } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { isSupportersMode } from '@/lib/score-mode'
import { loadGroepData } from '@/lib/tornooi-groep'
import { Dagprogramma } from './Dagprogramma'
import '../../../tornooi.css'

export const dynamic = 'force-dynamic'

// Dagprogramma van een tornooidag: alle wedstrijden van alle categorieën chronologisch onder
// elkaar, plus een veldoverzicht (het krachtbalveld uit de analyse) dat per veld toont wat er
// speelt of komt. De organisatie stelt hier het aantal velden in en wijst wedstrijden toe;
// supporters lezen gewoon mee.
export default async function DagprogrammaPage({ params }: { params: Promise<{ naam: string }> }) {
  const { naam: ruw } = await params
  const naam = decodeURIComponent(ruw).trim()
  if (!naam) notFound()

  const payload = await getPayloadClient()
  const data = await loadGroepData(payload, naam)
  if (!data) notFound()

  const user = await getAuthUser()
  // Dit stuurt enkel de knoppen "Aantekenen"/"Corrigeren" per wedstrijd — dus het aantekenrecht,
  // niet het tornooibeheer.
  const canManage = magTornooiAantekenen(user)
  // In supporters-modus mag ook een gewone ingelogde bezoeker meetellen. Dit overzicht is de plek
  // waar je op een tornooidag van veld naar veld springt, dus hoort de knop hier ook voor hem te
  // staan — anders moet hij eerst de juiste reeks opzoeken om aan dezelfde wedstrijd te geraken.
  const magScoren = magTornooiAantekenen(user, await isSupportersMode(payload))

  return <Dagprogramma naam={naam} initial={data} canManage={canManage} magScoren={magScoren} ingelogd={Boolean(user)} />
}
