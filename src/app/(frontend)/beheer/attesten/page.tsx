import Link from 'next/link'

import { KaartenOpladen } from '@/components/KaartenOpladen'
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
        <h1 className="page-title">🩺 Medische kaarten</h1>
        <p className="acc-page-intro">
          Hier laad je ingevulde medische kaarten (attesten) op en ken je ze toe. Een kaart met de QR-code van een lid komt vanzelf bij dat lid
          en is meteen goedgekeurd als alles juist staat. Al de rest komt in de lijst <strong>Ter nakijken</strong> hieronder: daar kies je het lid
          en keur je goed of af.
        </p>

        {toon === 'nakijken' && (
          <section className="wb-card" style={{ marginBottom: 18 }}>
            <h2>📷 Kaarten opladen</h2>
            <p className="wb-sub">
              Selecteer een stapel foto&apos;s of scans tegelijk (ook een PDF). Kaarten zonder leesbare QR-code of blanco kaarten komen ter nakijken
              om toe te kennen.
            </p>
            <KaartenOpladen />
          </section>
        )}

        <h2 style={{ margin: '0 0 6px' }}>{toon === 'nakijken' ? `Ter nakijken (${lijst.length})` : 'Recent afgekeurd'}</h2>
        <p className="acc-page-intro">Kaarten die het systeem niet vanzelf kon goedkeuren: blanco, zonder QR-code, of met een onduidelijk vakje.</p>
        <div className="wb-btn-row" style={{ margin: '0 0 14px' }}>
          {toon === 'nakijken' ? (
            <Link className="wb-btn" href="/beheer/attesten?toon=afgekeurd">
              Recent afgekeurd
            </Link>
          ) : (
            <Link className="wb-btn" href="/beheer/attesten">
              Ter nakijken
            </Link>
          )}
          <a className="wb-btn" href="/api/attest/blanco" target="_blank" rel="noopener">
            🖨️ Blanco kaart
          </a>
          <Link className="wb-btn" href="/beheer/leden">
            🖨️ Kaart van een lid (ledenregister)
          </Link>
          <Link className="wb-btn" href="/attest">
            🔗 Publieke link
          </Link>
        </div>
        {lijst.length === 0 ? (
          <p className="empty">{toon === 'nakijken' ? 'Niets na te kijken. ✅' : 'Geen afgekeurde attesten.'}</p>
        ) : (
          <AttestenNakijken lijst={lijst} vandaag={dateStrBE()} alleenLezen={toon !== 'nakijken'} />
        )}
      </div>
    </>
  )
}
