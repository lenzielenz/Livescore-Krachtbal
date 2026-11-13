import Link from 'next/link'

import { AttestBezorgen } from '@/components/AttestBezorgen'
import { SiteHeader } from '@/components/SiteHeader'
import { korteNaam } from '@/lib/attest'
import { getAuthUser } from '@/lib/auth-user'
import { formatDateBE } from '@/lib/datetime'
import { kaartCode, leesKaartCode } from '@/lib/medische-kaart-code'
import { kaartRol } from '@/lib/medische-kaart-server'
import { getPayloadClient } from '@/lib/payload-client'
import { keuringGeldig } from '@/lib/registratie'
import '@/components/attest-bezorgen.css'
import '../../attest/attest.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Medisch attest', robots: { index: false } }

// Hier komt wie de QR op een medisch attest scant (lib/medische-kaart-code.ts). Iedereen kan het ingevulde
// attest meteen bezorgen — zonder login: de code wijst het lid aan, het systeem leest de vakjes en zegt of het
// in orde is. Wie zonder login komt, ziet enkel "Kaat K."; wie het lid mag (het lid, een ouder, de club, de
// federatie), ziet de keuring en kan het attest opnieuw afdrukken.
export default async function KaartPagina({ params }: { params: Promise<{ code: string }> }) {
  const { code: rauw } = await params
  const playerId = leesKaartCode(decodeURIComponent(rauw))
  const payload = await getPayloadClient()
  const speler = playerId != null ? await payload.findByID({ collection: 'players', id: playerId, depth: 0, overrideAccess: true }).catch(() => null) : null
  const me = await getAuthUser()
  const rol = me && speler ? await kaartRol(payload, me, speler as never) : null
  const code = playerId != null ? kaartCode(playerId) : ''
  const keuring = speler?.medischeKeuringOp ? String(speler.medischeKeuringOp) : null

  return (
    <>
      <SiteHeader />
      <div className="site at">
        <header className="at-held">
          <p className="at-boven">Krachtbal · medisch attest</p>
          <h1>Attest bezorgen</h1>
        </header>
        {!speler ? (
          <section className="at-lid">
            <span aria-hidden>⚠️</span>
            <div>
              <strong>Deze code hoort niet bij een lid</strong>
              <p>
                Kijk of je de hele QR-code scande. Je kan het attest ook bezorgen via de <Link href="/attest">algemene link</Link>.
              </p>
            </div>
          </section>
        ) : (
          <>
            <section className="at-lid">
              <span aria-hidden>🩺</span>
              <div>
                <strong>Medisch attest van {rol ? String(speler.name ?? '') : korteNaam(speler.voornaam, speler.name)}</strong>
                <p>
                  {rol
                    ? keuring
                      ? `Laatste keuring: ${formatDateBE(keuring)} — ${keuringGeldig(keuring) ? 'geldig dit seizoen' : 'verlopen'}.`
                      : 'Nog geen keuring geregistreerd.'
                    : 'Neem een foto van het ingevulde attest of laad een scan op. Inloggen is niet nodig.'}
                </p>
              </div>
            </section>
            {rol && (
              <div className="at-acties">
                <a className="wb-btn" href={`/api/medische-kaart/pdf?ids=${playerId}`} target="_blank" rel="noopener">
                  🖨️ Attest opnieuw afdrukken
                </a>
              </div>
            )}
            <AttestBezorgen code={code} naam={korteNaam(speler.voornaam, speler.name)} />
          </>
        )}
      </div>
    </>
  )
}
