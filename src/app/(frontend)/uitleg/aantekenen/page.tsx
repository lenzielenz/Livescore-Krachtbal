import type { Metadata } from 'next'
import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { AANTEKEN_STAPPEN, UITLEG_PDF_PAD } from '@/lib/aantekenen-uitleg'
import { Oefenen } from './Oefenen'
import './uitleg.css'

export const metadata: Metadata = {
  title: 'Een wedstrijd aantekenen — Krachtbal Live',
  description: 'Stap voor stap: inloggen, het dagprogramma, aantekenen, starten en beëindigen. Met een oefenversie en een afdrukbare handleiding.',
}

// Uitleg voor wie aan de tornooitafel zit. Drie vormen van hetzelfde: lezen, oefenen, afdrukken.
// De stappen komen uit één lijst (lib/aantekenen-uitleg.ts), zodat het papier nooit iets anders
// zegt dan het scherm.
export default function UitlegAantekenenPage() {
  return (
    <>
      <SiteHeader active="tornooi" />
      <div className="site">
        <h1 className="page-title">
          Een wedstrijd <span className="brand">aantekenen</span>
        </h1>
        <p className="uit-lead">
          Voor aan de tornooitafel. Doorloop de stappen hieronder en tik ze zelf eens door in het
          oefenscherm — daar gebeurt niets echt: geen wedstrijd, geen melding, niemand die meekijkt.
        </p>

        <div className="uit-snel">
          <a className="va-btn primary" href={UITLEG_PDF_PAD} target="_blank" rel="noopener noreferrer">
            🖨 Handleiding afdrukken (PDF)
          </a>
          <Link className="va-btn" href="/tornooi">
            Naar de tornooien →
          </Link>
        </div>

        <Oefenen />

        {/* Alles op een rij, voor wie liever eerst het geheel ziet — en voor wie de pagina
            afdrukt zonder de PDF te halen. */}
        <details className="uit-alles">
          <summary>Alle stappen onder elkaar</summary>
          <ol className="uit-lijst">
            {AANTEKEN_STAPPEN.map((s) => (
              <li key={s.nr}>
                <strong>
                  <span aria-hidden>{s.icoon}</span> {s.titel}
                </strong>
                <p>{s.tekst}</p>
                {s.knop && <p className="uit-knopnaam">Knop: {s.knop}</p>}
                {s.letOp && <p className="uit-letop">Let op — {s.letOp}</p>}
              </li>
            ))}
          </ol>
        </details>
      </div>
    </>
  )
}
