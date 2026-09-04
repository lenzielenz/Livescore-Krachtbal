'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

import { MIN_WACHTWOORD, geldigeToken } from '@/lib/wachtwoord-reset'

// Nieuw wachtwoord kiezen met de herstellink van de beheerder.
//
// De token staat in de URL (?token=…). We controleren hem hier alleen op vorm — of hij echt
// geldig en nog niet verlopen is, weet enkel de server, en die zegt het pas bij het indienen.
// Anders zou dit scherm moeten verklappen welke tokens bestaan.
export function HerstelForm() {
  const router = useRouter()
  const token = geldigeToken(useSearchParams().get('token'))
  const [wachtwoord, setWachtwoord] = useState('')
  const [herhaal, setHerhaal] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [klaar, setKlaar] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (wachtwoord.length < MIN_WACHTWOORD) {
      setError(`Kies een wachtwoord van minstens ${MIN_WACHTWOORD} tekens.`)
      return
    }
    if (wachtwoord !== herhaal) {
      setError('De twee wachtwoorden zijn niet gelijk.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/wachtwoord-herstellen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: wachtwoord }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Herstellen mislukt.')
        return
      }
      setKlaar(true)
      // Even laten staan zodat de melding gelezen wordt, dan naar de login.
      setTimeout(() => router.push('/inloggen'), 2500)
    } catch {
      setError('Er ging iets mis — probeer opnieuw.')
    } finally {
      setBusy(false)
    }
  }

  if (!token) {
    return (
      <>
        <p className="login-error">
          Deze link is onvolledig. Vraag je beheerder om een nieuwe herstellink.
        </p>
        <p className="login-foot">
          <Link href="/wachtwoord-vergeten">Hoe vraag ik er een aan?</Link>
        </p>
      </>
    )
  }

  if (klaar) {
    return (
      <>
        <p className="pw-klaar">
          ✓ Je wachtwoord is gewijzigd. Log opnieuw in met je nieuwe wachtwoord.
        </p>
        <p className="login-foot">
          <Link href="/inloggen">Naar inloggen →</Link>
        </p>
      </>
    )
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label className="login-label">
        Nieuw wachtwoord
        <input
          className="login-input"
          type="password"
          autoComplete="new-password"
          value={wachtwoord}
          onChange={(e) => setWachtwoord(e.target.value)}
          minLength={MIN_WACHTWOORD}
          required
        />
      </label>
      <label className="login-label">
        Nog eens ter controle
        <input
          className="login-input"
          type="password"
          autoComplete="new-password"
          value={herhaal}
          onChange={(e) => setHerhaal(e.target.value)}
          minLength={MIN_WACHTWOORD}
          required
        />
      </label>
      <button type="submit" className="login-btn" disabled={busy}>
        {busy ? 'Bezig…' : 'Wachtwoord instellen'}
      </button>
      {error && <p className="login-error">{error}</p>}
      <p className="pw-hint">
        Minstens {MIN_WACHTWOORD} tekens. Na het instellen wordt iedereen uit dit account
        uitgelogd — ook op andere toestellen.
      </p>
    </form>
  )
}
