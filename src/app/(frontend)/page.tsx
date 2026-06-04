import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { LiveBoard } from './live/LiveBoard'
import { loadLiveDay } from './live/loadLiveDay'
import './live/live.css'

export const dynamic = 'force-dynamic'

// Profiel 1 — supporters — komt op de startpagina en volgt meteen de wedstrijden.
// De tools voor de andere profielen (clubs, scheidsrechters, federatie) staan
// discreet onderaan, netjes per profiel gegroepeerd.
type Role = {
  key: string
  badge: string
  title: string
  intro: string
  links: { href: string; label: string }[]
}

const ROLES: Role[] = [
  {
    key: 'clubs',
    badge: '👥',
    title: 'Voor clubs',
    intro: 'Wedstrijd voorbereiden, aantekenen aan het veld en de schermen bedienen.',
    links: [
      { href: '/scorekeeper', label: '📝 Aantekenen' },
      { href: '/club', label: 'Mijn club — opstelling & wedstrijden' },
      { href: '/kantine', label: '🍻 Kantinescherm' },
      { href: '/cast', label: '📺 Schermen naar tv' },
      { href: '/beheer/spelers', label: 'Spelers toevoegen' },
      { href: '/demo', label: '🎓 Demo spelen' },
    ],
  },
  {
    key: 'scheidsrechters',
    badge: '🟨',
    title: 'Voor scheidsrechters',
    intro: 'Je wedstrijdblad vrijgeven en je onkostennota opmaken.',
    links: [
      { href: '/scheidsrechter/portaal', label: 'Mijn QR-portaal' },
      { href: '/vergoedingen', label: 'Vergoedingen' },
    ],
  },
  {
    key: 'federatie',
    badge: '🏛️',
    title: 'Voor de federatie',
    intro: 'Reglement, seizoensplanning en het volledige beheer.',
    links: [
      { href: '/admin', label: 'Beheer (admin)' },
      { href: '/beheer/planning', label: '📅 Seizoensplanning' },
      { href: '/reglement', label: 'Reglement' },
      { href: '/knipjes', label: 'Knipjes' },
      { href: '/bekerfinale', label: 'Bekerfinale' },
    ],
  },
]

export default async function HomePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams
  const today = new Date().toISOString().slice(0, 10)
  const selected = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today

  const days = await loadLiveDay(selected, today)

  return (
    <>
      <SiteHeader active="wedstrijden" />
      <div className="lb-page">
        {/* Profiel 1: meteen de wedstrijden. */}
        <div className="home-intro">
          <h1>
            <span className="brand">Krachtbal</span> Live
          </h1>
          <p>Volg alle wedstrijden live — score, tijd, kruisjes en time-outs.</p>
          <Link href="/tornooi" className="home-intro-link">Tornooien →</Link>
        </div>

        <LiveBoard date={selected} today={today} matches={days} />

        {/* De andere profielen, discreet onderaan. */}
        <section className="home-roles">
          <h2 className="home-roles-head">Aan de slag</h2>
          <p className="home-roles-sub">Vul je wedstrijden in, teken het blad af of beheer de competitie.</p>
          <div className="role-grid">
            {ROLES.map((r) => (
              <div key={r.key} className="role-card">
                <div className="role-card-top">
                  <span className="role-badge" aria-hidden="true">{r.badge}</span>
                  <h3>{r.title}</h3>
                </div>
                <p className="role-intro">{r.intro}</p>
                <div className="role-links">
                  {r.links.map((l) => (
                    <Link key={l.href} href={l.href} className="role-link">
                      {l.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}
