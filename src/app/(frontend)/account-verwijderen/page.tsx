import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { getAuthUser } from '@/lib/auth-user'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Account verwijderen — Krachtbal Live',
  description: 'Hoe je je Krachtbal Live-account definitief verwijdert, en wat er met je gegevens gebeurt.',
}

// Publieke uitlegpagina bij het verwijderen van een account. Verplicht voor de Google Play Store:
// wie een account kan aanmaken, moet het ook kunnen verwijderen — in de app én via een webadres dat
// werkt zónder de app te installeren. Deze pagina is dat webadres.
export default async function AccountVerwijderenPage({
  searchParams,
}: {
  searchParams: Promise<{ klaar?: string }>
}) {
  const { klaar } = await searchParams
  const me = await getAuthUser()
  const gedaan = klaar === '1'

  return (
    <>
      <SiteHeader />
      <div className="site">
        <h1 className="page-title"><span className="brand">Account verwijderen</span></h1>

        {gedaan ? (
          <section className="wb-card" style={{ maxWidth: 620 }}>
            <p className="wb-sub">
              Je account is verwijderd. Bedankt om Krachtbal Live te gebruiken — je bent altijd
              welkom om later opnieuw te beginnen.
            </p>
            <Link href="/" className="wb-btn wb-btn-primary">Naar het live-bord →</Link>
          </section>
        ) : (
          <>
            <p className="wb-intro" style={{ maxWidth: 720 }}>
              Je kan je account op elk moment zelf verwijderen. Dat kan rechtstreeks in de app of op
              deze site — je hoeft niemand te mailen en er is geen wachttijd.
            </p>

            <section className="wb-card" style={{ maxWidth: 720 }}>
              <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Zo doe je het</h2>
              <ol style={{ margin: '0 0 14px', paddingLeft: '1.2rem', lineHeight: 1.7 }}>
                <li>Log in met je e-mailadres.</li>
                <li>Ga naar <b>Mijn profiel</b>.</li>
                <li>Onderaan staat <b>Account verwijderen</b>. Typ <b>VERWIJDER</b> ter bevestiging.</li>
              </ol>
              {me ? (
                <Link href="/profiel" className="wb-btn wb-btn-primary">Naar mijn profiel →</Link>
              ) : (
                <Link href="/inloggen" className="wb-btn wb-btn-primary">Inloggen →</Link>
              )}
            </section>

            <section className="wb-card" style={{ maxWidth: 720, marginTop: 16 }}>
              <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Wat verdwijnt er?</h2>
              <ul style={{ margin: '0 0 14px', paddingLeft: '1.2rem', lineHeight: 1.7 }}>
                <li>Je account: naam, e-mailadres, wachtwoord, club, speelpositie en profielfoto.</li>
                <li>Je aanwezigheden (check-ins), badges en supporterspunten.</li>
                <li>Je voedings- en trainingsgegevens die aan je account hangen.</li>
                <li>Je pushmeldingen (abonnementen op dit toestel en andere).</li>
                <li>Je stemmen (bv. man van de match).</li>
              </ul>
              <h2 style={{ fontSize: '1rem' }}>Wat blijft er bestaan?</h2>
              <p style={{ margin: '0 0 8px', lineHeight: 1.7 }}>
                De <b>wedstrijdgegevens</b> zelf: scores, worpen, wedstrijdbladen en klassementen. Dat
                is het officiële verslag van een wedstrijd tussen twee ploegen — dat mag niet
                verdwijnen omdat één aantekenaar of supporter zijn account sluit. De koppeling met
                jouw naam wordt wel losgemaakt: er blijft staan wat er gebeurde, niet wie het
                registreerde.
              </p>
              <p style={{ margin: 0, lineHeight: 1.7 }}>
                Ben je ook <b>speler</b> in een ploeg, dan is dat een aparte fiche die je club beheert
                (rugnummer, positie, en bij jeugd een geboortedatum). Vraag het verwijderen daarvan aan
                je clubbeheerder — of aan de federatie als je club niet meer actief is.
              </p>
            </section>

            <p className="wb-intro" style={{ maxWidth: 720, marginTop: 16 }}>
              Meer over welke gegevens we bijhouden en waarom: <Link href="/privacy" style={{ color: 'var(--accent)', fontWeight: 700 }}>Privacybeleid →</Link>
            </p>
          </>
        )}
      </div>
    </>
  )
}
