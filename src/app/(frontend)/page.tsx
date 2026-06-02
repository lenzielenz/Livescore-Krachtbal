import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'

// De startpagina is een overzicht ("hub"): alles wat we gebouwd hebben, logisch gegroepeerd.
// Het pure live-bord leeft op /live.
export default function HomePage() {
  return (
    <>
      <SiteHeader active={null} />
      <div className="site hub">
        <section className="hub-hero">
          <h1>
            <span className="brand">Krachtbal</span> Live
          </h1>
          <p>Volg wedstrijden, bedien de schermen aan het veld en regel het wedstrijdblad — alles op één plek.</p>
        </section>

        {/* De vier schermen van één wedstrijd, in logische volgorde: invoer → weergaven. */}
        <h2 className="hub-h">Eén wedstrijd, vier schermen</h2>
        <p className="hub-sub">
          Het <strong>aantekenbord</strong> voert in. De drie andere schermen tonen datzelfde verloop live,
          elk aan een eigen publiek.
        </p>
        <div className="hub-flow">
          <Link href="/scorekeeper" className="hub-screen input">
            <span className="hub-step">1 · invoer</span>
            <span className="hub-ico">📝</span>
            <h3>Aantekenbord</h3>
            <p>De aantekenaar voert de wedstrijd live in op een tablet, naast de scheidsrechter.</p>
          </Link>
          <span className="hub-arrow" aria-hidden="true">→</span>
          <Link href="/live" className="hub-screen">
            <span className="hub-step">2 · aan het veld</span>
            <span className="hub-ico">📺</span>
            <h3>Veldscherm</h3>
            <p>Groot scherm bij het terrein. Open een wedstrijd en kies “📺 Veldscherm”.</p>
          </Link>
          <Link href="/kantine" className="hub-screen">
            <span className="hub-step">3 · in de kantine</span>
            <span className="hub-ico">🍻</span>
            <h3>Kantinescherm</h3>
            <p>Scherm in de kantine: kies welke wedstrijden je daar wil tonen.</p>
          </Link>
          <Link href="/live" className="hub-screen">
            <span className="hub-step">4 · overal</span>
            <span className="hub-ico">📱</span>
            <h3>Live-score</h3>
            <p>Iedereen volgt mee op gsm of laptop, waar dan ook.</p>
          </Link>
        </div>

        <div className="hub-cols">
          <section className="hub-group">
            <h2 className="hub-h">Wedstrijddag — voorbereiding & blad</h2>
            <p className="hub-sub">In volgorde: opstelling → akkoord scheidsrechter → aantekenen → aftekenen.</p>
            <Link href="/scorekeeper" className="hub-card">
              <strong>Aantekenen-overzicht</strong>
              <span>Kies een wedstrijd. Per wedstrijd: opstelling, scheidsrechter en aftekenen.</span>
            </Link>
            <Link href="/tornooi" className="hub-card">
              <strong>Tornooien</strong>
              <span>Knock-out-schema’s met eigen aantekenbord, veld- en kantinescherm.</span>
            </Link>
            <Link href="/demo" className="hub-card">
              <strong>🎓 Demo spelen</strong>
              <span>Oefen het aantekenbord met 8 fictieve spelers per kant — altijd speelbaar.</span>
            </Link>
          </section>

          <section className="hub-group">
            <h2 className="hub-h">Info & beheer</h2>
            <p className="hub-sub">Naslag en administratie.</p>
            <div className="hub-links">
              <Link href="/reglement" className="hub-pill">Reglement</Link>
              <Link href="/knipjes" className="hub-pill">Knipjes</Link>
              <Link href="/vergoedingen" className="hub-pill">Vergoedingen</Link>
              <Link href="/bekerfinale" className="hub-pill">Bekerfinale</Link>
              <Link href="/beheer/spelers" className="hub-pill">Spelers toevoegen</Link>
              <Link href="/admin" className="hub-pill">Beheer (admin)</Link>
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
