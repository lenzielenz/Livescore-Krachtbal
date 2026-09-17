'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { clearNavAuth } from '@/lib/nav-auth-cache'

// Supporter-registratie: maakt een account (rol 'viewer') en logt meteen in.
export function RegisterForm({ clubs }: { clubs: { id: number; name: string }[] }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [clubId, setClubId] = useState('')
  // "Alleen supporter": wie geen eigen club heeft/kiest, mag toch snel clubs volgen zodat hij
  // ingelogd meteen de juiste clubs te zien krijgt (i.p.v. helemaal niets, of alles door elkaar).
  const [supporterOnly, setSupporterOnly] = useState(false)
  const [followedClubIds, setFollowedClubIds] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const toggleFollowed = (id: number) => {
    setFollowedClubIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
          clubId: clubId || undefined,
          followedClubIds: supporterOnly && followedClubIds.length > 0 ? followedClubIds : undefined,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Registreren mislukt.')
        return
      }
      // Account aangemaakt → meteen inloggen.
      const login = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })
      setDone(true)
      if (login.ok) {
        // Verse rol-staat afdwingen zodat de navigatie meteen de juiste menu-items toont.
        clearNavAuth()
        router.refresh()
        router.push('/')
      }
    } catch {
      setError('Er ging iets mis — probeer opnieuw.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <section className="wb-card" style={{ maxWidth: 440 }}>
        <h2>Welkom! 🎉</h2>
        <p className="wb-sub">Je account is aangemaakt en je bent ingelogd. Veel kijkplezier.</p>
        <Link href="/" className="wb-btn wb-btn-primary">Naar de wedstrijden →</Link>
      </section>
    )
  }

  return (
    <section className="wb-card" style={{ maxWidth: 440 }}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.8rem', color: 'var(--dim)' }}>
          Naam (optioneel)
          <input className="wb-input" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.8rem', color: 'var(--dim)' }}>
          E-mail
          <input className="wb-input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.8rem', color: 'var(--dim)' }}>
          Wachtwoord (min. 8 tekens)
          <input className="wb-input" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {clubs.length > 0 && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.8rem', color: 'var(--dim)' }}>
            Mijn club (optioneel)
            <select
              className="wb-input"
              value={clubId}
              onChange={(e) => {
                setClubId(e.target.value)
                // Een club gekozen? Dan leidt die de weergave — het volg-lijstje is dan overbodig.
                if (e.target.value) {
                  setSupporterOnly(false)
                  setFollowedClubIds([])
                }
              }}
            >
              <option value="">— Geen / kies later —</option>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        )}

        {clubs.length > 0 && !clubId && !supporterOnly && (
          <button type="button" className="wb-btn" onClick={() => setSupporterOnly(true)}>
            🙋 Ik ben enkel supporter, geen lid van een club
          </button>
        )}

        {clubs.length > 0 && !clubId && supporterOnly && (
          <div className="rf-follow">
            <p className="rf-follow-lbl">Geen probleem! Welke club(s) wil je toch volgen? Dan zie je die meteen als je inlogt.</p>
            <div className="rf-follow-list">
              {clubs.map((c) => (
                <label key={c.id} className="rf-follow-item">
                  <input type="checkbox" checked={followedClubIds.includes(c.id)} onChange={() => toggleFollowed(c.id)} />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
        )}

        <button type="submit" disabled={busy} className="wb-btn wb-btn-primary">
          {busy ? 'Bezig…' : 'Account aanmaken'}
        </button>
        {error && <p className="wb-msg" style={{ color: '#e0533d' }}>{error}</p>}
      </form>
      <p className="wb-sub" style={{ marginTop: 14 }}>
        Al een account? <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
      </p>
    </section>
  )
}
