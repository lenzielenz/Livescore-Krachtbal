import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { afgelastingenLijst } from '@/lib/afgelasting'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { FederatieAlleen } from '../FederatieAlleen'
import { AfgelastingenBeheer } from './AfgelastingenBeheer'
import '../federatie-tools.css'
import '../../wedstrijdblad.css'

export const dynamic = 'force-dynamic'

// Afgelastingen door scheidsrechters (lib/afgelasting.ts): foto's bekijken, een nieuwe datum
// plannen of de afgelasting intrekken. Clubs en scheidsrechter krijgen telkens een melding.
export default async function AfgelastingenPage({ searchParams }: { searchParams: Promise<{ alle?: string }> }) {
  const me = await getAuthUser()
  if (!isFederationLevel(me)) return <FederatieAlleen titel="Afgelastingen" />
  const alle = (await searchParams).alle === '1'
  const payload = await getPayloadClient()
  const lijst = await afgelastingenLijst(payload, alle ? {} : { status: { equals: 'gemeld' } }, 200)
  return (
    <>
      <SiteHeader active="federatie" />
      <div className="site site-breed">
        <h1 className="page-title">⛈️ Afgelastingen</h1>
        <p className="acc-page-intro">
          Door de scheidsrechter afgelast, met foto&apos;s van het terrein of het weer. Plan een nieuwe datum: beide clubs
          en de scheidsrechter krijgen een melding. {alle ? <Link href="/beheer/afgelastingen">Enkel te plannen →</Link> : <Link href="/beheer/afgelastingen?alle=1">Ook behandelde tonen →</Link>}
        </p>
        {lijst.length === 0 ? <p className="empty">Geen afgelastingen te plannen. ☀️</p> : <AfgelastingenBeheer lijst={lijst} />}
      </div>
    </>
  )
}
