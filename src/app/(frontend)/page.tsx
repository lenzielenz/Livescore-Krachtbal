import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { randomQuote } from '@/lib/krachtbal-quotes'
import { PROFILES } from '@/lib/profiles'
import { LiveBoard } from './live/LiveBoard'
import { loadLiveDay } from './live/loadLiveDay'
import './live/live.css'

export const dynamic = 'force-dynamic'

// Profiel 1 — supporters — komt op de startpagina en volgt meteen de wedstrijden.
// De andere profielen (clubs, scheidsrechters, federatie) staan discreet onderaan:
// per profiel een instappunt + de bijhorende tools (gedeeld met de header en de
// profielpagina's via lib/profiles).
export default async function HomePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams
  const today = new Date().toISOString().slice(0, 10)
  const selected = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today

  const days = await loadLiveDay(selected, today)
  // Elk bezoek een ander krachtbal-lijntje (LTT-stijl).
  const quote = randomQuote()

  return (
    <>
      <SiteHeader active="wedstrijden" />
      <div className="lb-page">
        {/* Profiel 1: meteen de wedstrijden. */}
        <div className="home-intro">
          <h1>
            <span className="brand">Krachtbal</span> Live
          </h1>
          <Link href="/tornooi" className="home-intro-link">Tornooien →</Link>
        </div>
        {/* Roterende quote — feit, wist-je-datje of een gekke oneliner. */}
        <p className="home-quote">{quote}</p>

        <LiveBoard date={selected} today={today} matches={days} />

        {/* De andere profielen, discreet onderaan. */}
        <section className="home-roles">
          <h2 className="home-roles-head">Aan de slag</h2>
          <p className="home-roles-sub">Vul je wedstrijden in, teken het blad af of beheer de competitie.</p>
          <div className="role-grid">
            {PROFILES.map((p) => (
              <div key={p.key} className="role-card">
                <Link href={p.hubHref} className="role-card-top">
                  <span className="role-badge" aria-hidden="true">{p.badge}</span>
                  <h3>{p.title}</h3>
                </Link>
                <p className="role-intro">{p.intro}</p>
                <div className="role-links">
                  <Link href={p.hubHref} className="role-link role-link-hub">{p.hubLabel} →</Link>
                  {p.tools
                    .filter((t) => t.href !== p.hubHref)
                    .map((t) => (
                      <Link key={t.href} href={t.href} className="role-link">
                        {t.label}
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
