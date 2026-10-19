import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { getPayloadClient } from '@/lib/payload-client'
import { isSupportersMode } from '@/lib/score-mode'
import './uitleg.css'

// Dynamisch: in supportersmodus staat de demo uit, en dan verdwijnen de demo-knoppen hier ook.
export const dynamic = 'force-dynamic'

// Tutorial: de volledige flow van een wedstrijd, van registreren tot aftekenen.
// Bedoeld als instap voor iedereen — supporters, clubs, scheidsrechters en federatie zien
// in één oogopslag wie wat doet en in welke volgorde.

// Wie doet wat — de rollen kort uitgelegd.
const ROLES = [
  { badge: '📣', name: 'Supporter', desc: 'Volgt wedstrijden live, gratis.' },
  { badge: '👥', name: 'Club', desc: 'Opstelling + aantekenen aan het veld.' },
  { badge: '🟨', name: 'Scheidsrechter', desc: 'Geeft vrij, keurt goed en tekent af.' },
  { badge: '🏛️', name: 'Federatie', desc: 'Plant het seizoen en beheert alles.' },
] as const

// Meer dan kijken — wat een supporter allemaal kan op het platform (de nieuwe dingen).
const FEATURES = [
  { ico: '💬', tone: 'accent', name: 'Live tribune', desc: 'Reageer met emoji’s en moedig je ploeg aan terwijl de match loopt.' },
  { ico: '📸', tone: 'pop', name: 'Foto- & video-tribune', desc: 'Deel sfeerbeelden en korte video’s op volwassen wedstrijden, al vanaf een uur vóór de aftrap. Ze blijven bewaard en duiken na afloop terug op bij de samenvatting.' },
  { ico: '📡', tone: 'accent', name: 'Veldscherm koppelen', desc: 'Sta je aan het veld? Koppel de wedstrijd aan het scherm met de code — al vanaf een kwartier vóór de aftrap, door een supporter van thuis óf uit. Is het scherm nog bezet met de vorige match, dan zet dezelfde code je alvast in de wachtrij.' },
  { ico: '🔮', tone: 'pop', name: 'Pronostiek', desc: 'Voorspel de exacte eindstand en strijd mee in het globale klassement.' },
  { ico: '🎰', tone: 'accent', name: 'Bonusrad', desc: 'De besten van het weekend (aantal schaalt met het deelnemersveld) draaien aan het rad en winnen vermenigvuldigers.' },
  { ico: '📺', tone: 'pop', name: 'Kantinescherm', desc: 'Toon de live stand van je club groot op de tv in de kantine.' },
  { ico: '📈', tone: 'accent', name: 'Analyse (clubs)', desc: 'Worp-voor-worp-analyse, gevaarzones en een video-replay op het veld.' },
] as const

type Step = {
  n: number
  who: string
  title: string
  body: React.ReactNode
  list?: string[]
  actions?: { href: string; label: string; primary?: boolean }[]
}

const STEPS: Step[] = [
  {
    n: 1,
    who: 'Iedereen',
    title: 'Registreren',
    body: (
      <>
        Maak een <strong>gratis account</strong> aan. Kies je een club, dan word je overal meteen
        naar je eigen club gestuurd. Nog bij geen enkele club aangesloten? Kies dan{' '}
        <strong>"alleen supporter"</strong> en volg meteen de club(s) die je interesseren — ook dan
        zie je overal de juiste info. Ben je clubmedewerker, scheidsrechter of van de federatie? Een
        beheerder kent je nadien de juiste rol toe — een scheidsrechter wordt gekoppeld aan z'n
        dossier en krijgt zo een persoonlijke QR-code.
      </>
    ),
    list: [
      'Naam, e-mail, wachtwoord — klaar.',
      'Standaard ben je supporter (volgen); geen eigen club? Volg er dan een paar.',
      'Wachtwoord vergeten? Je clubverantwoordelijke of de federatie maakt ter plaatse een herstellink.',
      'Beheerder geeft clubmedewerker / scheidsrechter / federatie de juiste rechten.',
    ],
    actions: [
      { href: '/registreren', label: '📝 Registreren', primary: true },
      { href: '/inloggen', label: '🔐 Inloggen' },
    ],
  },
  {
    n: 2,
    who: 'Federatie + club',
    title: 'Wedstrijd selecteren',
    body: (
      <>
        De federatie zet het seizoen klaar (reeksindeling, kalender en uren). Daarna kiest de club
        de juiste wedstrijd. Vanaf dan verschijnen de <strong>vier wedstrijddag-stappen</strong>{' '}
        in vaste volgorde: opstelling → scheidsrechter → aantekenen → aftekenen.
      </>
    ),
    list: [
      'Federatie plant: reeksen, kalender, speeluren.',
      'Club opent z\'n wedstrijd via "Mijn club" of de wedstrijdenlijst.',
      'De stappenbalk leidt je daarna door de hele wedstrijddag.',
    ],
    actions: [
      { href: '/', label: '📅 Wedstrijden' },
      { href: '/club', label: '👥 Mijn club' },
    ],
  },
  {
    n: 3,
    who: 'Club',
    title: 'Opstelling klaarzetten',
    body: (
      <>
        De club vult vooraf de <strong>opstelling met rugnummers</strong> in voor thuis én uit. Om
        eerlijk te spelen worden de opstellingen pas zichtbaar kort vóór aanvang (de vrijgavetijd,
        standaard 60 min vooraf).
      </>
    ),
    list: [
      'Spelers + rugnummers per ploeg.',
      'Kapiteins aanduiden (zij tekenen straks af).',
      'Opstelling wordt zichtbaar vanaf de vrijgavetijd.',
    ],
    actions: [{ href: '/club', label: '👥 Naar mijn club' }],
  },
  {
    n: 4,
    who: 'Scheidsrechter',
    title: 'Goedkeuring vóór de wedstrijd',
    body: (
      <>
        De scheidsrechter logt in op z'n portaal en geeft de wedstrijd vrij met z'n{' '}
        <strong>persoonlijke QR-code</strong> (of backup-code). Hij controleert de opstellingen en
        de verplichte officials en geeft het <strong>akkoord voor de wedstrijdstart</strong>. De
        federatie kan de vrijgavecode desnoods doorgeven.
      </>
    ),
    list: [
      'Inloggen op het QR-portaal → QR/code tonen.',
      'Wedstrijd vrijgeven en opstellingen nakijken.',
      'Verplichte officials controleren.',
      'Akkoord geven: de wedstrijd mag starten.',
    ],
    actions: [{ href: '/scheidsrechter/portaal', label: '🟨 Scheidsrechtersportaal', primary: true }],
  },
  {
    n: 5,
    who: 'Club',
    title: 'Aantekenen aan het veld',
    body: (
      <>
        Tijdens de wedstrijd houdt de club aan het veld <strong>elke worp en het balbezit</strong>{' '}
        bij. De stand loopt live mee — supporters volgen ze op de startpagina, reageren in de{' '}
        <strong>live tribune</strong>, delen foto’s, en geven hun <strong>pronostiek</strong> door.
        Staat er een tv aan het veld, dan koppelt een supporter of aantekenaar de wedstrijd er
        gewoon aan met de code op het scherm.
      </>
    ),
    list: [
      'Worpen en balbezit live aantekenen (groot veld, automatisch volledig scherm).',
      'Supporters volgen live, reageren met emoji’s en delen sfeerfoto’s.',
      'Voorspel mee de uitslag — pronostiek-klassement + bonusrad.',
      'Veldscherm koppelen met de code — al vanaf een kwartier vóór de aftrap.',
      'Toon de stand groot op het kantinescherm.',
    ],
    actions: [
      { href: '/scorekeeper', label: '📝 Aantekenen' },
      { href: '/kantine', label: '🍻 Kantinescherm' },
      { href: '/demo', label: '🎓 Probeer de demo' },
    ],
  },
  {
    n: 6,
    who: 'Kapiteins + scheidsrechter',
    title: 'Afwerken & aftekenen',
    body: (
      <>
        Na de laatste worp controleer je de <strong>eindstand</strong>. Beide kapiteins tekenen
        digitaal af, en de scheidsrechter tekent af en <strong>dient het wedstrijdblad in</strong>.
        Daarna maakt de scheidsrechter z'n onkostennota op — en de wedstrijd is klaar voor de
        analyse en de knipjes.
      </>
    ),
    list: [
      'Eindstand controleren.',
      'Beide kapiteins tekenen af.',
      'Scheidsrechter tekent af en dient in.',
      'Vergoeding opmaken → analyse & knipjes volgen.',
    ],
    actions: [
      { href: '/vergoedingen', label: '💶 Vergoedingen' },
      { href: '/analyse', label: '📈 Analyse' },
    ],
  },
]

export default async function UitlegPage() {
  const demoUit = await isSupportersMode(await getPayloadClient()).catch(() => false)
  return (
    <>
      <SiteHeader active={null} />
      <div className="site">
        <div className="tut-hero">
          <span className="tut-hero-eyebrow">📘 Zo werkt het</span>
          <h1 className="tut-hero-title">
            Krachtbal Live, <span className="brand">van A tot Z</span>
          </h1>
          <p className="tut-hero-sub">
            De <strong>volledige flow van een wedstrijd</strong> — van je account aanmaken tot het
            wedstrijdblad aftekenen — plus alles wat je als supporter kan beleven: tribune, foto’s,
            pronostiek en het bonusrad.
          </p>
        </div>

        <h2 className="tut-section-h">⭐ Meer dan kijken</h2>
        <div className="tut-features">
          {FEATURES.map((f) => (
            <div key={f.name} className={`tut-feat tone-${f.tone}`}>
              <span className="tut-feat-ico" aria-hidden>{f.ico}</span>
              <span className="tut-feat-txt">
                <span className="tut-feat-name">{f.name}</span>
                <span className="tut-feat-desc">{f.desc}</span>
              </span>
            </div>
          ))}
        </div>

        <h2 className="tut-section-h">🗓️ De wedstrijddag, stap voor stap</h2>
        <div className="tut-roles">
          {ROLES.map((r) => (
            <div key={r.name} className="tut-role">
              <span className="tut-role-badge" aria-hidden>
                {r.badge}
              </span>
              <span className="tut-role-txt">
                <span className="tut-role-name">{r.name}</span>
                <span className="tut-role-desc">{r.desc}</span>
              </span>
            </div>
          ))}
        </div>

        <div className="tut-timeline">
          {STEPS.map((s) => (
            <div key={s.n} className="tut-step">
              <div className="tut-dot" aria-hidden>
                {s.n}
              </div>
              <div className="tut-card">
                <div className="tut-head">
                  <span className="tut-title">{s.title}</span>
                  <span className="tut-who">{s.who}</span>
                </div>
                <p className="tut-body">{s.body}</p>
                {s.list && (
                  <ul className="tut-list">
                    {s.list.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                )}
                {s.actions && (
                  <div className="tut-actions">
                    {s.actions.filter((a) => !(demoUit && a.href === '/demo')).map((a) => (
                      <Link key={a.href + a.label} href={a.href} className={`tut-btn ${a.primary ? 'primary' : ''}`}>
                        {a.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="tut-outro">
          <h2>Klaar om te starten?</h2>
          <p>
            {demoUit
              ? 'Registreer je gratis als supporter, of bekijk de prijzen & pakketten.'
              : 'Registreer je gratis als supporter, probeer meteen de demo om het aantekenen te voelen, of bekijk de prijzen & pakketten.'}
          </p>
          <div className="tut-actions" style={{ justifyContent: 'center' }}>
            <Link href="/registreren" className="tut-btn primary">
              📝 Registreren
            </Link>
            {!demoUit && (
              <Link href="/demo" className="tut-btn">
                🎓 Demo proberen
              </Link>
            )}
            <Link href="/prijzen" className="tut-btn">
              💎 Prijzen &amp; pakketten
            </Link>
            <Link href="/pronostiek" className="tut-btn">
              🔮 Pronostiek
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
