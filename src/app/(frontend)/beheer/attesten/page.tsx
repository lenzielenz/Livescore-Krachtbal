import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { attestenLijst } from '@/lib/attest-server'
import { getAuthUser } from '@/lib/auth-user'
import { dateStrBE } from '@/lib/datetime'
import { getPayloadClient } from '@/lib/payload-client'
import { FederatieAlleen } from '../FederatieAlleen'
import { AttestenNakijken } from './AttestenNakijken'
import '../federatie-tools.css'
import '../../wedstrijdblad.css'
import './attesten.css'

export const dynamic = 'force-dynamic'

// Medische attesten ter nakijken (lib/attest.ts): wat het systeem niet vanzelf kon goedkeuren — een blanco
// attest (het lid nog te zoeken), een foto zonder QR, een onduidelijk vakje. Goedkeuren zet de keuring van het
// lid; afkeuren met een reden. Het lid, de ouders en de club krijgen telkens een melding.
export default async function AttestenPage({ searchParams }: { searchParams: Promise<{ toon?: string }> }) {
  const me = await getAuthUser()
  if (!isFederationLevel(me)) return <FederatieAlleen titel="Medische attesten" />
  const toon = (await searchParams).toon === 'afgekeurd' ? 'afgekeurd' : 'nakijken'
  const payload = await getPayloadClient()
  const lijst = await attestenLijst(payload, toon, toon === 'afgekeurd' ? 50 : 200)
  return (
    <>
      <SiteHeader active="federatie" />
      <div className="site site-breed">
        <h1 className="page-title">🩺 Medische attesten</h1>
        <p className="acc-page-intro">
          Attesten die het systeem niet vanzelf kon goedkeuren. Alles juist (QR van het lid, vier hoeken, &quot;geschikt&quot;
          aangekruist) wordt automatisch goedgekeurd en staat hier niet.{' '}
          {toon === 'nakijken' ? <Link href="/beheer/attesten?toon=afgekeurd">Recent afgekeurd →</Link> : <Link href="/beheer/attesten">Ter nakijken →</Link>}
          {' · '}
          <a href="/api/attest/blanco" target="_blank" rel="noopener">
            Blanco attest (PDF)
          </a>
          {' · '}
          <Link href="/attest">Publieke link</Link>
        </p>
        {lijst.length === 0 ? (
          <p className="empty">{toon === 'nakijken' ? 'Niets na te kijken. ✅' : 'Geen afgekeurde attesten.'}</p>
        ) : (
          <AttestenNakijken lijst={lijst} vandaag={dateStrBE()} alleenLezen={toon !== 'nakijken'} />
        )}
      </div>
    </>
  )
}
