import Link from 'next/link'

import { LedenficheForm } from '@/components/LedenficheForm'
import { LidDocumenten } from '@/components/LidDocumenten'
import { SiteHeader } from '@/components/SiteHeader'
import { hasRole, isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { formatDateBE } from '@/lib/datetime'
import { ficheLezen, magFiche } from '@/lib/ledenfiche'
import { documentenVan } from '@/lib/lid-documenten'
import { lidmaatschapVan } from '@/lib/lidmaatschap'
import { getPayloadClient } from '@/lib/payload-client'
import '../lid.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Ledenfiche', robots: { index: false } }

// De ledenfiche van één lid: gegevens (adres, contact, noodcontact, toestemmingen), lidmaatschap en documenten,
// met het attest van lidmaatschap voor de mutualiteit. Voor de federatie, de staf van de club van het lid, het
// lid zelf en de ouders (lib/ledenfiche.ts → magFiche). Iedereen anders ziet niets.
export default async function LidPagina({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id)
  const me = await getAuthUser()
  const payload = await getPayloadClient()
  const mag = Number.isSafeInteger(id) && me ? await magFiche(payload, me, id) : false
  if (!mag) {
    return (
      <>
        <SiteHeader />
        <div className="site">
          <h1 className="page-title">Ledenfiche</h1>
          <p className="empty">{me ? 'Deze ledenfiche kan je niet bekijken.' : <Link href={`/inloggen?next=/lid/${id}`}>Log in om de ledenfiche te bekijken →</Link>}</p>
        </div>
      </>
    )
  }
  const [fiche, docs, lm] = await Promise.all([ficheLezen(payload, id), documentenVan(payload, me, id), lidmaatschapVan(payload, id)])
  const staf = isFederationLevel(me) || hasRole(me, 'club-beheerder', 'club-medewerker')
  const { naam, lidSinds, ficheBijgewerktOp, ...gegevens } = fiche!
  void lidSinds
  return (
    <>
      <SiteHeader />
      <div className="site lid">
        <h1 className="page-title">📇 {naam}</h1>
        <p className="wb-sub">
          {lm ? `Aangesloten bij ${lm.club} voor het seizoen ${lm.seizoen} (sinds ${formatDateBE(lm.vanaf)}${lm.tot ? `, tot ${formatDateBE(lm.tot)}` : ''}).` : 'Nog niet aangesloten bij de federatie dit seizoen.'}
          {ficheBijgewerktOp ? ` Gegevens bijgewerkt op ${formatDateBE(ficheBijgewerktOp)}.` : ''}
        </p>

        <section className="wb-card">
          <h2>Gegevens</h2>
          <LedenficheForm playerId={id} begin={gegevens} />
        </section>

        <section className="wb-card">
          <h2>Attest van lidmaatschap</h2>
          <p className="wb-sub">Voor de mutualiteit (terugbetaling van het lidgeld) of de werkgever. De club vult het ontvangen lidgeld in en tekent.</p>
          {lm ? (
            <a className="wb-btn" href={`/api/lid-documenten/attest?playerId=${id}&seizoen=${lm.seizoen}`} target="_blank" rel="noopener">
              🖨️ Attest {lm.seizoen} (PDF)
            </a>
          ) : (
            <p className="wb-sub">Er is pas een attest zodra het lid aangesloten is (goedgekeurd door de federatie).</p>
          )}
        </section>

        <section className="wb-card">
          <h2>Documenten</h2>
          <p className="wb-sub">Bv. het formulier van de mutualiteit, een identiteitskaart voor de vergunning, een toestemming. Enkel de federatie, de club en het lid (of de ouders) zien ze.</p>
          <LidDocumenten playerId={id} docs={docs ?? []} staf={staf} />
        </section>
      </div>
    </>
  )
}
