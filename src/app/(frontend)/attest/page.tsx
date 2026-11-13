import Link from 'next/link'

import { AttestBezorgen } from '@/components/AttestBezorgen'
import { SiteHeader } from '@/components/SiteHeader'
import { getPayloadClient } from '@/lib/payload-client'
import { huidigSeizoen } from '@/lib/uitlening'
import '@/components/attest-bezorgen.css'
import './attest.css'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Medisch attest bezorgen',
  description: 'Bezorg het medisch attest voor de krachtbalcompetitie: foto nemen of opladen, zonder in te loggen.',
}

// De algemene link voor het medisch attest — voor iedereen, zonder login. Het attest met de QR-code van het
// lid komt vanzelf bij het juiste lid (en is meteen goedgekeurd als alles juist staat); een blanco attest gaat
// naar de federatie, die het lid opzoekt. Zie lib/attest.ts en lib/attest-server.ts.
export default async function AttestPagina() {
  const seizoen = await huidigSeizoen(await getPayloadClient())
  return (
    <>
      <SiteHeader />
      <div className="site at">
        <header className="at-held">
          <p className="at-boven">Krachtbal · seizoen {seizoen.label}</p>
          <h1>Medisch attest bezorgen</h1>
          <p className="at-intro">Neem een foto van het ingevulde attest of laad een scan op. Inloggen is niet nodig. Je ziet meteen of het in orde is.</p>
        </header>

        <ol className="at-stappen">
          <li>
            <span>1</span>
            <div>
              <strong>Druk het attest af</strong>
              <p>
                Met de QR-code van het lid (via <Link href="/profiel">Mijn profiel</Link> of je club), of het{' '}
                <a href="/api/attest/blanco" target="_blank" rel="noopener">
                  blanco attest
                </a>
                .
              </p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Laat het invullen door de arts</strong>
              <p>Met een duidelijk kruisje in het vakje, stempel en handtekening.</p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Bezorg het hier</strong>
              <p>Het systeem leest de QR-code en de vakjes. Staat alles juist, dan is het meteen goedgekeurd.</p>
            </div>
          </li>
        </ol>

        <section className="at-kaart" aria-label="Attest bezorgen">
          <AttestBezorgen />
        </section>

        <section className="at-uitleg">
          <details>
            <summary>Wanneer is het attest meteen goedgekeurd?</summary>
            <p>
              Als de QR-code van het lid op de foto staat, de vier zwarte hoeken in beeld zijn en de arts &quot;geschikt voor de
              krachtbalsport&quot; duidelijk aankruiste. Anders kijkt de federatie het attest na: een blanco attest, een eigen formulier
              van de arts, of een vakje dat niet duidelijk te lezen is.
            </p>
          </details>
          <details>
            <summary>Hoelang geldt een keuring?</summary>
            <p>Het hele competitieseizoen waarin ze gebeurde, tot 30 juni. Voor het volgende seizoen is een nieuw attest nodig.</p>
          </details>
          <details>
            <summary>Wie ziet het attest?</summary>
            <p>Enkel de federatie, de club en het lid (of de ouders). Het is een medisch document: wie zonder login oplaadt, ziet nooit meer dan de voornaam en de eerste letter van de familienaam.</p>
          </details>
        </section>
      </div>
    </>
  )
}
