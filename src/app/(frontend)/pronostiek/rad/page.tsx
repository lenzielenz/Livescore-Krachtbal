import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { loadRadState } from '@/lib/pronostiek-rad-server'
import { Wheel } from './Wheel'
import './rad.css'
import '../../club/voorspel/voorspel.css'

export const dynamic = 'force-dynamic'

// Bonusrad — de winnaar van vorig weekend draait aan het rad dat 3 wedstrijden uitkiest die deze
// week dubbele punten waard worden. Iedereen kan de pagina bekijken; enkel de winnaar kan draaien.
export default async function RadPage() {
  const payload = await getPayloadClient()
  const me = await getAuthUser()
  const myId = me ? Number((me as { id?: number }).id) : null
  const state = await loadRadState(payload)
  const iAmWinner = myId != null && state.winner?.userId === myId

  return (
    <>
      <SiteHeader active="stand" />
      <div className="site">
        <h1 className="page-title">🎡 <span className="brand">Bonusrad</span></h1>
        <p className="vs-intro">
          De winnaar van de pronostiek van vorig weekend draait aan het rad. Het kiest <strong>3 wedstrijden</strong> die deze week
          <strong> dubbele punten</strong> opleveren. <Link href="/pronostiek" style={{ color: 'var(--accent)' }}>Naar de stand</Link>.
        </p>

        {state.alreadySpun ? (
          <div className="rad-card">
            <h2>✨ De bonuswedstrijden zijn gekozen</h2>
            <p>Deze wedstrijden zijn deze week <strong>dubbele punten</strong> waard:</p>
            <ul className="rad-bonuslist">
              {state.boosted.map((m) => (
                <li key={m.id} className="rad-result">
                  <span className="rad-result-x">×2</span>
                  <Link href={`/match/${m.id}`} className="rad-result-m" style={{ textDecoration: 'none', color: 'var(--txt)' }}>
                    {m.home} <span className="rad-vs">–</span> {m.away}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : iAmWinner && state.candidates.length > 0 ? (
          <>
            <div className="rad-card">
              <h2>🏆 Jij won vorig weekend!</h2>
              <p>Draai aan het rad en bepaal welke 3 wedstrijden deze week dubbele punten worden.</p>
            </div>
            <Wheel candidates={state.candidates.map((m) => ({ id: m.id, home: m.home, away: m.away }))} />
          </>
        ) : state.winner ? (
          <div className="rad-card">
            <h2>🏆 {state.winner.name} won vorig weekend</h2>
            <p>{state.winner.name} mag aan het rad draaien om de 3 bonuswedstrijden te kiezen. Kom straks terug om te zien welke het worden!</p>
          </div>
        ) : (
          <div className="rad-card">
            <h2>Speel mee voor het rad</h2>
            <p>Wie dit weekend de meeste pronostiekpunten haalt, mag volgende week aan het rad draaien en 3 bonuswedstrijden kiezen. <Link href="/" style={{ color: 'var(--accent)' }}>Voorspel mee →</Link></p>
          </div>
        )}
      </div>
    </>
  )
}
