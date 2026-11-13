import Link from 'next/link'

import { KaartenOpladen } from '@/components/KaartenOpladen'
import { SiteHeader } from '@/components/SiteHeader'
import { getAuthUser } from '@/lib/auth-user'
import { formatDateBE } from '@/lib/datetime'
import { leesKaartCode } from '@/lib/medische-kaart-code'
import { kaartRol, magKaartAfdrukken } from '@/lib/medische-kaart-server'
import { getPayloadClient } from '@/lib/payload-client'
import '@/components/kaarten-opladen.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Medische kaart', robots: { index: false } }

// Hier komt wie de QR op een medische kaart scant (lib/medische-kaart-code.ts). Wie dat lid mag (het lid,
// een ouder, de club, de federatie) laadt meteen de foto van de ingevulde kaart op. Iedereen anders ziet
// niets over het lid: de code verklapt geen naam.
export default async function KaartPagina({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const playerId = leesKaartCode(decodeURIComponent(code))
  const me = await getAuthUser()
  const payload = await getPayloadClient()
  const speler = playerId != null ? await payload.findByID({ collection: 'players', id: playerId, depth: 0, overrideAccess: true }).catch(() => null) : null
  const rol = me && speler ? await kaartRol(payload, me, speler as never) : null
  const afdrukken = rol && playerId != null ? await magKaartAfdrukken(payload, me, playerId) : false

  return (
    <>
      <SiteHeader />
      <div className="site kq">
        <h1 className="page-title">🩺 Medische kaart</h1>
        {!speler ? (
          <p className="wb-sub">Deze code is geen geldige medische kaart. Kijk of je de hele QR-code scande.</p>
        ) : !me ? (
          <section className="wb-card">
            <p>Dit is een medische kaart voor krachtbal. Log in om de ingevulde kaart op te laden — als lid, ouder of clubverantwoordelijke.</p>
            <div className="kq-acties">
              <Link className="wb-btn wb-btn-primary" href={`/inloggen?next=${encodeURIComponent(`/k/${code}`)}`}>
                Inloggen
              </Link>
            </div>
          </section>
        ) : !rol ? (
          <p className="wb-sub">Deze kaart hoort bij een lid waarvoor jouw account niets kan doen. Laat de kaart opladen door het lid, een ouder of de club.</p>
        ) : (
          <section className="wb-card">
            <h2>{String(speler.name ?? '')}</h2>
            <p className="wb-sub">
              {speler.medischeKeuringOp ? `Laatste keuring: ${formatDateBE(String(speler.medischeKeuringOp))}` : 'Nog geen keuring geregistreerd.'}
            </p>
            {afdrukken && (
              <div className="kq-acties">
                <a className="wb-btn" href={`/api/medische-kaart/pdf?ids=${playerId}`} target="_blank" rel="noopener">
                  🖨️ Lege kaart afdrukken
                </a>
              </div>
            )}
            <KaartenOpladen voorLid={playerId!} naam={String(speler.voornaam || speler.name || '')} />
          </section>
        )}
      </div>
    </>
  )
}
