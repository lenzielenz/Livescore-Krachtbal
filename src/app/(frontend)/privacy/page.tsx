import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'

export const metadata = {
  title: 'Privacybeleid — Krachtbal Live',
  description: 'Welke gegevens Krachtbal Live bijhoudt, waarom, hoe lang, en wat je rechten zijn.',
}

// Privacybeleid. Verplicht voor de Google Play Store (elke app heeft een publieke privacy-URL nodig)
// en sowieso voor een platform met ledengegevens, jeugdspelers en medische fiches.
//
// De tekst beschrijft wat de code écht doet — niet meer, niet minder. Wat nog ingevuld moet worden
// door de club/federatie staat expliciet gemarkeerd; verzin daar niets bij.
const CONTACT = process.env.NEXT_PUBLIC_PRIVACY_CONTACT?.trim() || null
const VERANTWOORDELIJKE = process.env.NEXT_PUBLIC_PRIVACY_OWNER?.trim() || null

function Sectie({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <section className="wb-card" style={{ maxWidth: 760, marginBottom: 16 }}>
      <h2 style={{ marginTop: 0, fontSize: '1.02rem' }}>{titel}</h2>
      <div style={{ lineHeight: 1.7, fontSize: '0.92rem' }}>{children}</div>
    </section>
  )
}

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <div className="site">
        <h1 className="page-title"><span className="brand">Privacybeleid</span></h1>
        <p className="wb-intro" style={{ maxWidth: 760 }}>
          Krachtbal Live is een live-score- en clubplatform voor krachtbal. Deze pagina legt uit welke
          gegevens we bijhouden, waarom, hoe lang, en wat je daar zelf aan kan doen.
        </p>

        {!VERANTWOORDELIJKE && (
          <p
            className="wb-card"
            style={{ maxWidth: 760, marginBottom: 16, borderColor: '#f6c544', fontSize: '0.86rem' }}
          >
            <b>Nog in te vullen:</b> de verwerkingsverantwoordelijke (welke vzw/federatie) en een
            contactadres. Zet <code>NEXT_PUBLIC_PRIVACY_OWNER</code> en{' '}
            <code>NEXT_PUBLIC_PRIVACY_CONTACT</code> in de omgeving; dan verdwijnt dit blok en staan
            de juiste gegevens hieronder. Zonder die gegevens is dit beleid niet volledig — de Play
            Store vraagt er expliciet naar.
          </p>
        )}

        <Sectie titel="Wie verwerkt je gegevens?">
          <p style={{ margin: 0 }}>
            {VERANTWOORDELIJKE ?? 'De beheerder van dit platform'} is verantwoordelijk voor de
            verwerking. Vragen of een verzoek over je gegevens?{' '}
            {CONTACT ? (
              <>Mail naar <a href={`mailto:${CONTACT}`} style={{ color: 'var(--accent)' }}>{CONTACT}</a>.</>
            ) : (
              'Neem contact op via je club of de federatie.'
            )}
          </p>
        </Sectie>

        <Sectie titel="Welke gegevens houden we bij?">
          <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
            <li>
              <b>Je account</b>: naam, e-mailadres, versleuteld wachtwoord, je club, je speelpositie en
              (als je er een uploadt) een profielfoto. Je hebt enkel een account nodig om mee te doen —
              live volgen kan zonder.
            </li>
            <li>
              <b>Spelersfiches</b>: naam, rugnummer en positie, beheerd door de club. Bij jeugdspelers
              ook een geboortedatum, om de leeftijdscategorie te bepalen. Die gevoelige velden zijn
              niet publiek zichtbaar — enkel voor de club en de federatie.
            </li>
            <li>
              <b>Wedstrijdgegevens</b>: worpen, score, tijdlijn, wedstrijdbladen, opstellingen en
              handtekeningen op het digitale wedstrijdblad. Dit is het officiële verslag van een
              wedstrijd.
            </li>
            <li>
              <b>Ongevalsaangiften</b>: medische gegevens op de ongevalsfiche. Die zijn extra
              afgeschermd: enkel de betrokken club en de federatie kunnen ze inzien.
            </li>
            <li>
              <b>Meedoen als supporter</b>: aanwezigheden (check-ins), pronostiek, stemmen, badges,
              reacties en foto&apos;s in de tribune tijdens een wedstrijd.
            </li>
            <li>
              <b>Pushmeldingen</b>: als je ze aanzet, bewaren we het abonnement van je browser of
              toestel om je een melding te kunnen sturen.
            </li>
            <li>
              <b>Technisch</b>: een inlogcookie om je sessie te onthouden, en tijdelijk je IP-adres om
              misbruik te beperken (aantal verbindingen en uploads per adres). We gebruiken geen
              advertentie- of trackingcookies.
            </li>
          </ul>
        </Sectie>

        <Sectie titel="Waarom, en op welke grond?">
          <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
            <li>Om de competitie te laten werken: uitslagen, klassementen en wedstrijdbladen (gerechtvaardigd belang van de sportfederatie en haar clubs).</li>
            <li>Om jouw account en voorkeuren te beheren (uitvoering van de overeenkomst die je aangaat door een account te maken).</li>
            <li>Om pushmeldingen te sturen (enkel met jouw toestemming, en je kan ze weer uitzetten).</li>
            <li>Om verzekeringsdossiers bij een ongeval af te handelen (wettelijke verplichting en gerechtvaardigd belang van de federatie).</li>
          </ul>
        </Sectie>

        <Sectie titel="Wie kan wat zien?">
          <p style={{ marginTop: 0 }}>
            Uitslagen, klassementen, spelersnamen en sportstatistieken zijn publiek — dat is de kern
            van een livescore-platform. Niet publiek zijn: e-mailadressen, geboortedata, medische
            gegevens, en alles wat op het wedstrijdblad achter de aftekenflow zit. Analyse-opnames die
            je zelf maakt, zijn privé: enkel jij (en wie jij ze uitdrukkelijk laat zien) kan ze
            bekijken.
          </p>
          <p style={{ marginBottom: 0 }}>
            We verkopen geen gegevens en delen ze niet met adverteerders. De sponsorbanners op het
            veld- en kantinescherm zijn gewone afbeeldingen die de club zelf beheert — geen
            advertentienetwerk, dus ze volgen je niet.
          </p>
        </Sectie>

        <Sectie titel="Hoe lang bewaren we het?">
          <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
            <li><b>Wedstrijdgegevens</b>: onbeperkt — het is het sportieve archief van de competitie.</li>
            <li><b>Je account</b>: tot je het verwijdert.</li>
            <li><b>Tribunefoto&apos;s</b>: die verdwijnen automatisch een uur na het einde van de wedstrijd.</li>
            <li><b>Pushabonnementen</b>: tot je meldingen uitzet, of tot je toestel het abonnement intrekt.</li>
            <li><b>Ongevalsaangiften</b>: zolang het verzekeringsdossier loopt en de wettelijke bewaartermijn duurt.</li>
          </ul>
        </Sectie>

        <Sectie titel="Je rechten">
          <p style={{ marginTop: 0 }}>
            Je hebt recht op inzage, verbetering, verwijdering en overdracht van je gegevens, en je
            kan bezwaar maken tegen een verwerking. Het meeste kan je zelf: je profiel aanpassen in{' '}
            <Link href="/profiel" style={{ color: 'var(--accent)' }}>Mijn profiel</Link>, pushmeldingen
            uitzetten waar je ze aanzette, en je account definitief verwijderen via{' '}
            <Link href="/account-verwijderen" style={{ color: 'var(--accent)' }}>Account verwijderen</Link>.
          </p>
          <p style={{ marginBottom: 0 }}>
            Ben je het niet eens met hoe we met je gegevens omgaan, dan kan je klacht indienen bij de
            Belgische Gegevensbeschermingsautoriteit (gegevensbeschermingsautoriteit.be).
          </p>
        </Sectie>

        <Sectie titel="Kinderen">
          <p style={{ margin: 0 }}>
            Jeugdspelers staan in het platform omdat ze in een ploeg spelen; hun fiche wordt beheerd
            door de club, niet door het kind zelf. Van jeugdspelers tonen we publiek enkel wat bij de
            sport hoort (naam, rugnummer, sportstatistieken) — geen geboortedatum of contactgegevens.
            Wil een ouder of voogd gegevens laten verwijderen, dan kan dat via de club of via het
            contactadres hierboven.
          </p>
        </Sectie>

        <Sectie titel="Wijzigingen">
          <p style={{ margin: 0 }}>
            Verandert er iets aan wat we bijhouden, dan passen we deze pagina aan. Bij een ingrijpende
            wijziging melden we dat in de app.
          </p>
        </Sectie>
      </div>
    </>
  )
}
