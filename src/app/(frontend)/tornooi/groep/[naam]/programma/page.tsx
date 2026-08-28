import { notFound } from 'next/navigation'

import { hasRole, isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
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
  const canManage = isFederationLevel(user) || hasRole(user, 'scheidsrechter')

  return <Dagprogramma naam={naam} initial={data} canManage={canManage} />
}
