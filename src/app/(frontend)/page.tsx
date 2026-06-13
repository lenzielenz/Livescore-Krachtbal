import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { userClubId } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { dateStrBE } from '@/lib/datetime'
import { quoteForDay } from '@/lib/krachtbal-quotes'
import { LiveBoard } from './live/LiveBoard'
import { loadLiveDay } from './live/loadLiveDay'
import './live/live.css'

export const dynamic = 'force-dynamic'

// Profiel 1 — supporters — komt op de startpagina en volgt enkel de wedstrijden.
// De tools voor de andere profielen leven in het "Meer"-menu, niet hier.
export default async function HomePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams
  const today = dateStrBE()
  const selected = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today

  const days = await loadLiveDay(selected, today)
  // Eén vast lijntje per dag (seed = vandaag): blijft staan bij het wisselen van datum,
  // maar levert elke dag een verse krachtbal-quote op.
  const quote = quoteForDay(today)
  const me = await getAuthUser()
  const cid = userClubId(me)
  const myClubId = cid != null && Number.isFinite(Number(cid)) ? Number(cid) : null

  return (
    <>
      <SiteHeader active="wedstrijden" />
      <div className="lb-page">
        <div className="home-intro">
          <h1>
            <span className="brand">Krachtbal</span> Live
          </h1>
          {/* Altijd zichtbare oriëntatie voor nieuwkomers — i.p.v. verstopt onder "Meer".
              Zo weet elke bezoeker meteen waar hij uitleg over het platform vindt. */}
          <Link href="/uitleg" className="home-intro-link">
            ❓ Zo werkt het
          </Link>
        </div>
        {/* Roterende quote — feit, wist-je-datje of een gekke oneliner. */}
        <p className="home-quote">{quote}</p>

        {!me && (
          <section className="home-cta">
            <div className="home-cta-text">
              <h2 className="home-cta-title">Wees erbij. <span>Élke match.</span></h2>
              <p className="home-cta-sub">Volg je club live — gratis account in 30 seconden.</p>
            </div>
            <div className="home-cta-actions">
              <Link href="/registreren" className="home-cta-btn">Gratis registreren →</Link>
              <Link href="/inloggen" className="home-cta-login">Al lid? Inloggen</Link>
            </div>
          </section>
        )}

        <LiveBoard date={selected} today={today} matches={days} myClubId={myClubId} />
      </div>
    </>
  )
}
