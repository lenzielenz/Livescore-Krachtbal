import { SiteHeader } from '@/components/SiteHeader'
import { Suspense } from 'react'

import { actieveDiensten } from '@/lib/oauth'
import { LoginForm } from './LoginForm'
import { OAuthKnoppen } from './OAuthKnoppen'
import './inloggen.css'

export const dynamic = 'force-dynamic'

// Gebrande login-pagina (vervangt de kale Payload-login voor het publiek). Bovenaan "Doorgaan met
// Google / Microsoft / Apple" voor de diensten die ingesteld zijn (lib/oauth.ts), daaronder e-mail en
// wachtwoord.
export default function InloggenPage() {
  return (
    <>
      <SiteHeader active={null} />
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-brand">
            <span className="brand">Krachtbal</span> Live
          </div>
          <p className="login-sub">Log in om verder te gaan</p>
          <Suspense fallback={null}>
            <OAuthKnoppen diensten={actieveDiensten()} />
          </Suspense>
          <LoginForm />
        </div>
      </div>
    </>
  )
}
