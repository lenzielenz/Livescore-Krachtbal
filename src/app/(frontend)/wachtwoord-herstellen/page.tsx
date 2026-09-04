import { Suspense } from 'react'

import { SiteHeader } from '@/components/SiteHeader'
import { HerstelForm } from './HerstelForm'
import '../inloggen/inloggen.css'

export const dynamic = 'force-dynamic'

// Het scherm achter de herstellink: hier kiest de gebruiker zelf een nieuw wachtwoord.
// De token zit in de querystring, vandaar de Suspense-grens rond het formulier
// (useSearchParams vraagt daarom in de App Router).
export default function WachtwoordHerstellenPage() {
  return (
    <>
      <SiteHeader active={null} />
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-brand">
            <span className="brand">Nieuw</span> wachtwoord
          </div>
          <p className="login-sub">Kies een wachtwoord dat je onthoudt</p>
          <Suspense fallback={<p className="login-sub">Even geduld…</p>}>
            <HerstelForm />
          </Suspense>
        </div>
      </div>
    </>
  )
}
