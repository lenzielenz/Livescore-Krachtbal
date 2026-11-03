import { SiteHeader } from '@/components/SiteHeader'
import { alleApps, grootteTekst, type AppBestand } from '@/lib/app-downloads'
import { isFederatieOmgeving } from '@/lib/omgeving'
import '../wedstrijdblad.css'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Android-apps — Krachtbal Live',
  description: 'Download de Krachtbal-apps voor Android: de aantekentafel en de volledige wedstrijddag voor de federatie.',
}

// Wat elke app doet, in gewone taal. De versie, grootte en het controlegetal komen uit het bestand zelf
// (lib/app-downloads.ts), zodat deze pagina nooit iets anders zegt dan wat je downloadt.
const BESCHRIJVING: Record<string, { slogan: string; punten: string[] }> = {
  federatie: {
    slogan: 'De hele wedstrijddag in één app',
    punten: [
      'Coach: de selectie opstellen, met rugnummers en kapitein.',
      'Scheidsrechter: spelers controleren, keuring, officials en de wedstrijd vrijgeven.',
      'Tafel: aantekenen met veldspelers en wissels — ook zonder internet.',
      'Na afloop: aftekenen met de vinger; het blad gaat vanzelf naar de federatie.',
      'Onderweg: aftrap verschuiven, blessure doorgeven of de wedstrijd afgelasten.',
      'Kies bij het inloggen een rol in de demoruimte ("Kijk als …"), zonder wachtwoord.',
    ],
  },
  aantekenaar: {
    slogan: 'De aantekentafel, stabiel en nauwkeurig',
    punten: [
      'Wedstrijd kiezen, klok starten, score, kruisjes en time-outs invullen.',
      'Elke tik wordt eerst op het toestel bewaard: niets gaat verloren bij slecht bereik.',
      'De klok loopt nauwkeurig door, ook als het scherm uit staat.',
      'Zoeken, filteren op Thuis/Uit en per reeks, zoals op de startpagina.',
    ],
  },
}

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']

function datumTekst(iso: string): string {
  const [j, m, d] = iso.split('-').map(Number)
  return j && m && d ? `${d} ${MAANDEN[m - 1]} ${j}` : iso
}

function Kaart({ app }: { app: AppBestand }) {
  const info = BESCHRIJVING[app.id]
  return (
    <section className="wb-card" style={{ maxWidth: 760, marginBottom: 16 }} id={app.id}>
      <h2 style={{ marginTop: 0 }}>{app.naam}</h2>
      {info && <p className="wb-sub" style={{ marginTop: -4 }}>{info.slogan}</p>}
      {info && (
        <ul style={{ lineHeight: 1.65, fontSize: '0.92rem', paddingLeft: 20, margin: '10px 0 14px' }}>
          {info.punten.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <p style={{ margin: '0 0 12px' }}>
        <a className="wb-btn wb-btn-primary" href={`/api/app/${app.id}`} download={app.bestand}>
          ⬇ Download voor Android
        </a>
      </p>
      <p className="wb-sub" style={{ margin: 0 }}>
        Versie {app.versie} · {grootteTekst(app.grootte)} · {datumTekst(app.datum)}
      </p>
      <details style={{ marginTop: 10, fontSize: '0.82rem' }}>
        <summary style={{ cursor: 'pointer', color: 'var(--dim)' }}>Controleer je download (SHA-256)</summary>
        <p style={{ margin: '8px 0 0' }}>
          Het bestand hoort dit controlegetal te hebben; zo weet je dat het onderweg niet veranderd is.
        </p>
        <code style={{ display: 'block', marginTop: 6, wordBreak: 'break-all', fontSize: '0.78rem' }}>{app.sha256}</code>
      </details>
    </section>
  )
}

export default async function AppPage() {
  const apps = await alleApps()
  // In de federatie-omgevingen (test en demo) staat de federatie-app bovenaan; op de gewone site de tafel-app.
  const volgorde = isFederatieOmgeving() ? ['federatie', 'aantekenaar'] : ['aantekenaar', 'federatie']
  const gesorteerd = [...apps].sort((a, b) => volgorde.indexOf(a.id) - volgorde.indexOf(b.id))

  return (
    <>
      <SiteHeader />
      <div className="site">
        <h1 className="page-title">
          <span className="brand">Android-apps</span>
        </h1>
        <p className="wb-intro" style={{ maxWidth: 760 }}>
          Krachtbal Live heeft twee apps voor Android. Ze staan nog niet in de Play Store; je installeert ze zelf, in een
          minuut. Bijwerken kan altijd door de nieuwe versie over de oude te installeren: je blijft ingelogd.
        </p>

        {gesorteerd.length === 0 ? (
          <p className="empty">De apps staan op dit moment niet klaar. Probeer het later opnieuw.</p>
        ) : (
          gesorteerd.map((app) => <Kaart key={app.id} app={app} />)
        )}

        <section className="wb-card" style={{ maxWidth: 760, marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Zo installeer je de app</h2>
          <ol style={{ lineHeight: 1.7, fontSize: '0.92rem', paddingLeft: 20, margin: 0 }}>
            <li>Tik op <b>Download voor Android</b>. Vraagt je browser of je dit type bestand wil bewaren, kies dan <i>Toch downloaden</i>.</li>
            <li>Open het gedownloade bestand. Vraagt Android om <i>installeren van onbekende apps</i> toe te staan voor je browser of Bestanden? Zet het aan, ga terug en tik op <i>Installeren</i>.</li>
            <li>Open de app. Meldt Google Play Protect dat de app onbekend is? Kies <i>Toch installeren</i>: deze apps komen rechtstreeks van dit platform.</li>
          </ol>
          <p className="wb-sub" style={{ marginBottom: 0 }}>
            Vereist Android 8.0 of nieuwer. Een iPhone? Gebruik de website: tik in Safari op <i>Deel</i> en dan op <i>Zet op beginscherm</i>.
          </p>
        </section>
      </div>
    </>
  )
}
