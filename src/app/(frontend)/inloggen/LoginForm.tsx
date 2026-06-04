'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

// Gebrande frontend-login: logt in via Payload's REST-auth en stuurt door naar
// de wedstrijden. Werkt voor elk account (supporter, club, scheidsrechter, admin).
export function LoginForm() {
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
        router.push('/')
      } else {
        setError('Inloggen mislukt — controleer je e-mail en wachtwoord.')
      }
    } catch {
      setError('Er ging iets mis — probeer opnieuw.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label className="login-label">
        E-mail
        <input className="login-input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className="login-label">
        Wachtwoord
        <input className="login-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      <button type="submit" className="login-btn" disabled={busy}>
        {busy ? 'Bezig…' : 'Inloggen'}
      </button>
      {error && <p className="login-error">{error}</p>}
      <p className="login-foot">
        Nog geen account? <Link href="/registreren">Registreren</Link>
      </p>
    </form>
  )
}
