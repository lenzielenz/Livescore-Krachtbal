import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import './prijzen.css'

export const metadata = {
  title: 'Prijzen & pakketten — Krachtbal Live',
  description:
    'Volg krachtbal gratis als supporter. Clubs kiezen een pakket (Starter, Team of Elite) voor wedstrijdblad, live aantekenen, analyse, training en de voedingsplanner.',
}

// Indicatieve prijzen — bewust als constante zodat ze in één oogopslag aan te passen zijn.
// (Voorstel; nog geen betaalintegratie — dit is de verkoop-/waardepagina.)
const PRICE = { team: 19, elite: 39 } as const

type Tier = {
  key: 'starter' | 'team' | 'elite'
  naam: string
  prijs: string
  per: string
  pitch: string
  cta: { label: string; href: string }
  featured?: boolean
  features: string[]
}

const TIERS: Tier[] = [
  {
    key: 'starter',
    naam: 'Starter',
    prijs: 'Gratis',
    per: 'altijd, voor iedereen',
    pitch: 'Volg je club live mee als supporter.',
    cta: { label: 'Gratis starten', href: '/registreren' },
    features: [
      'Live-scores & wedstrijdverloop',
      'Klassementen & jeugd-superster',
      'Pronostiek + bonusrad meespelen',
      'Weerbericht per wedstrijd',
      'Wedstrijd delen & in je agenda (.ics)',
    ],
  },
  {
    key: 'team',
    naam: 'Team',
    prijs: `€${PRICE.team}`,
    per: 'per maand, per club',
    pitch: 'Voor clubs die hun wedstrijden zelf beheren.',
    cta: { label: 'Team kiezen', href: '/registreren' },
    features: [
      'Alles van Starter',
      'Volledig wedstrijdblad (opstelling → scheidsrechter → aftekenen)',
      'Live aantekenen + tweede scherm / cast',
      'Kantinescherm voor in de zaal',
      'Leden- & opstellingsbeheer',
    ],
  },
  {
    key: 'elite',
    naam: 'Elite',
    prijs: `€${PRICE.elite}`,
    per: 'per maand, per club',
    pitch: 'Het volledige coach-platform om te winnen.',
    cta: { label: 'Elite kiezen', href: '/registreren' },
    featured: true,
    features: [
      'Alles van Team',
      'Analyse: ploegrapporten, spelers vergelijken, xP & aanvalspatronen',
      'Trainingsluik: plan, progressie & aanwezigheid',
      'Voedingsplanner op maat (incl. weekplan & boodschappenlijst)',
      'Panini-kaarten, deelkaarten & PDF-export',
    ],
  },
]

export default function PrijzenPage() {
  return (
    <>
      <SiteHeader />
      <main className="pr-page">
        <header className="pr-hero">
          <span className="pr-hero-eyebrow">💎 Prijzen & pakketten</span>
          <h1>Gratis voor supporters. <span className="brand">Krachtig voor clubs.</span></h1>
          <p>
            Wedstrijden volgen blijft voor iedereen gratis. Clubs kiezen een pakket en ontgrendelen
            het wedstrijdblad, live aantekenen en de volledige coach-tools — analyse, training en voeding.
          </p>
        </header>

        <section className="pr-grid" aria-label="Pakketten">
          {TIERS.map((t) => (
            <article key={t.key} className={`pr-tier${t.featured ? ' featured' : ''}`}>
              {t.featured && <span className="pr-ribbon">Aanbevolen</span>}
              <h2 className="pr-tier-naam">{t.naam}</h2>
              <p className="pr-tier-pitch">{t.pitch}</p>
              <div className="pr-price">
                <span className="pr-price-bedrag">{t.prijs}</span>
                <span className="pr-price-per">{t.per}</span>
              </div>
              <Link href={t.cta.href} className="pr-cta">{t.cta.label}</Link>
              <ul className="pr-feat">
                {t.features.map((f, i) => (
                  <li key={i}><span className="pr-check" aria-hidden>✓</span> {f}</li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <p className="pr-note">
          Indicatieve prijzen per club — jongeren-/meerploegenkorting bespreekbaar. Eén abonnement dekt
          al je ploegen en beheerders.
        </p>

        {/* Tweede verdienlaag: lokale sponsoring, subtiel en passend bij de uitstraling. */}
        <section className="pr-sponsor">
          <div className="pr-sponsor-body">
            <span className="pr-hero-eyebrow">🤝 Lokale sponsoring</span>
            <h2>Zet je sponsor in de spotlight</h2>
            <p>
              Lokale handelaars of clubsponsors krijgen een nette plek op de club- en wedstrijdpagina's
              (“aangeboden door …”). Veel waardevoller dan opdringerige banners — en je club deelt mee in
              de opbrengst. Geen flikkerende advertenties, wel een verzorgde uitstraling.
            </p>
            <Link href="/registreren" className="pr-cta pr-cta-ghost">Interesse? Maak een account</Link>
          </div>
        </section>

        <section className="pr-faq">
          <h2>Veelgestelde vragen</h2>
          <div className="pr-faq-item">
            <h3>Blijft live volgen gratis?</h3>
            <p>Ja. Supporters volgen scores, klassementen en de pronostiek altijd gratis — dat blijft zo.</p>
          </div>
          <div className="pr-faq-item">
            <h3>Wat betaalt een club precies?</h3>
            <p>Eén pakket per club, niet per gebruiker. Alle beheerders en ploegen van de club vallen eronder.</p>
          </div>
          <div className="pr-faq-item">
            <h3>Kunnen we later upgraden?</h3>
            <p>Zeker. Begin met Starter of Team en schakel over naar Elite zodra je de coach-tools wil gebruiken.</p>
          </div>
        </section>

        <p className="pr-foot">
          Vragen over een pakket of sponsoring? <Link href="/registreren">Maak een account</Link> en je clubbeheerder of de federatie helpt je verder.
        </p>
      </main>
    </>
  )
}
