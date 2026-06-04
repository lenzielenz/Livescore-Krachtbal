'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

// Frontend-login voor scheidsrechters: gebruikt het bestaande account (rol 'scheidsrechter').
// Logt in via Payload's REST-auth, waarna de pagina ververst en de persoonlijke QR toont.
export function RefereeLogin() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })
      if (res.ok) {
        router.refresh()
      } else {
        setError('Inloggen mislukt — controleer je e-mail en wachtwoord.')
      }
    } catch {
      setError('Inloggen mislukt — probeer opnieuw.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="wb-card" style={{ maxWidth: 420 }}>
      <h2>Inloggen</h2>
      <p className="wb-sub">Log in met je scheidsrechtersaccount om je persoonlijke QR-code te zien.</p>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.8rem', color: 'var(--dim)' }}>
          E-mail
          <input
            className="wb-input"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.8rem', color: 'var(--dim)' }}>
          Wachtwoord
          <input
            className="wb-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={busy} className="wb-btn wb-btn-primary">
          {busy ? 'Bezig…' : 'Inloggen'}
        </button>
        {error && <p className="wb-msg" style={{ color: '#e0533d' }}>{error}</p>}
      </form>
    </section>
  )
}
