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
        </div>
        {/* Roterende quote — feit, wist-je-datje of een gekke oneliner. */}
        <p className="home-quote">{quote}</p>

        {!me && (
          <section className="home-cta">
            <span className="home-cta-eyebrow">Gratis · 30 seconden · geen gedoe</span>
            <h2 className="home-cta-title">Wees erbij. <span>Élke match.</span></h2>
            <p className="home-cta-sub">
              Jouw club, élke worp, élke ontknoping — live op je gsm. Maak je gratis account aan en sta
              mee aan het veld, van de aftrap tot de laatste seconde. Geen account? Dan mis je het.
            </p>
            <ul className="home-cta-perks">
              <li><span aria-hidden>🏠</span> Jouw club, meteen in beeld</li>
              <li><span aria-hidden>🔔</span> Ping bij start &amp; eindstand</li>
              <li><span aria-hidden>📸</span> Jouw foto&apos;s aan het veld</li>
            </ul>
            <div className="home-cta-actions">
              <Link href="/registreren" className="home-cta-btn">Ik wil erbij — gratis →</Link>
              <Link href="/inloggen" className="home-cta-login">Al lid? Inloggen</Link>
            </div>
          </section>
        )}

        <LiveBoard date={selected} today={today} matches={days} myClubId={myClubId} />
      </div>
    </>
  )
}
