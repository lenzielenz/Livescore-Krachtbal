import { SiteHeader } from '@/components/SiteHeader'
import { LoginForm } from './LoginForm'
import './inloggen.css'

export const dynamic = 'force-dynamic'

// Gebrande login-pagina (vervangt de kale Payload-login voor het publiek).
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
          <LoginForm />
        </div>
      </div>
    </>
  )
}
