import Link from 'next/link'

import { KaartenOpladen } from '@/components/KaartenOpladen'
import { SiteHeader } from '@/components/SiteHeader'
import { hasRole, isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Medische kaarten opladen' }

// Een stapel ingevulde medische kaarten in één keer opladen (club of federatie): de QR op elke kaart
// zegt bij welk lid ze hoort (lib/medische-kaart-server.ts → kaartenOpladen).
export default async function KaartenOpladenPagina() {
  const me = await getAuthUser()
  const mag = me && (isFederationLevel(me) || hasRole(me, 'club-beheerder', 'club-medewerker'))
  return (
    <>
      <SiteHeader active={me && isFederationLevel(me) ? 'federatie' : undefined} />
      <div className="site kq">
        <h1 className="page-title">📷 Medische kaarten opladen</h1>
        {!me ? (
          <p className="wb-sub">
            <Link href="/inloggen?next=/medische-kaart/opladen">Log in</Link> om kaarten op te laden.
          </p>
        ) : !mag ? (
          <p className="wb-sub">
            Kaarten in een stapel opladen doet de club of de federatie. Je eigen kaart (of die van je kind) laad je op via{' '}
            <Link href="/profiel">Mijn profiel</Link>, of door de QR-code op de kaart te scannen.
          </p>
        ) : (
          <section className="wb-card">
            <p className="wb-sub">
              Neem van elke ingevulde kaart een foto (of scan ze) en selecteer ze hier allemaal tegelijk. De QR-code op de kaart zegt bij welk lid
              ze hoort; het attest komt meteen in het dossier van dat lid{isFederationLevel(me) ? '' : ' van je club'}. Een kaart zonder leesbare QR-code
              laad je op bij het lid zelf.
            </p>
            <KaartenOpladen />
          </section>
        )}
      </div>
    </>
  )
}
