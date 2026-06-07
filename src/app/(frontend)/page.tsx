import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { getAuthUser } from '@/lib/auth-user'
import { quoteForDay } from '@/lib/krachtbal-quotes'
import { LiveBoard } from './live/LiveBoard'
import { loadLiveDay } from './live/loadLiveDay'
import './live/live.css'

export const dynamic = 'force-dynamic'

// Profiel 1 — supporters — komt op de startpagina en volgt enkel de wedstrijden.
// De tools voor de andere profielen leven in het "Meer"-menu, niet hier.
export default async function HomePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams
  const today = new Date().toISOString().slice(0, 10)
  const selected = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today

  const days = await loadLiveDay(selected, today)
  // Eén vast lijntje per dag (seed = vandaag): blijft staan bij het wisselen van datum,
  // maar levert elke dag een verse krachtbal-quote op.
  const quote = quoteForDay(today)
  const me = await getAuthUser()

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
          <Link href="/registreren" className="home-supporter">
            📣 Volg je club — registreer gratis als supporter →
          </Link>
        )}

        <LiveBoard date={selected} today={today} matches={days} />
      </div>
    </>
  )
}
