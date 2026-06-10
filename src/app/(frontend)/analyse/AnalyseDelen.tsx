'use client'

import { useState } from 'react'

import { toast } from '@/components/Toaster'

type Account = { id: number; name: string }

// Analyse delen: duid de accounts aan die jouw analyse-data (wedstrijden, rapporten) mee mogen
// bekijken. De lijst wordt pas geladen wanneer je het menu openklapt.
export function AnalyseDelen() {
  const [loaded, setLoaded] = useState(false)
  const [users, setUsers] = useState<Account[]>([])
  const [shared, setShared] = useState<Set<number>>(new Set())
  const [savedCount, setSavedCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    if (loaded) return
    setLoaded(true)
    try {
      const res = await fetch('/api/analyse/delen', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'Laden mislukt.')
      setUsers(json.users)
      setShared(new Set<number>(json.shared))
      setSavedCount((json.shared as number[]).length)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const toggle = (id: number) => {
    setShared((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/analyse/delen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userIds: [...shared] }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'Bewaren mislukt.')
      setSavedCount((json.shared as number[]).length)
      toast('success', json.shared.length ? `Gedeeld met ${json.shared.length} account(s).` : 'Delen uitgezet.')
    } catch (err) {
      setError((err as Error).message)
      toast('error', (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="an-record-menu" onToggle={(e) => (e.target as HTMLDetailsElement).open && load()}>
      <summary className="an-record-summary">
        <span className="an-record-summary-title">🤝 Delen</span>
        <span className="an-record-summary-hint">
          wie mag jouw analyses mee bekijken{savedCount ? ` · gedeeld met ${savedCount}` : ''}
        </span>
      </summary>
      <div className="an-record-body">
        <p className="an-delen-hint">
          Aangevinkte accounts zien jouw analysewedstrijden en -rapporten mee (alleen-lezen via hun
          eigen analyse-pagina&apos;s). Uitvinken stopt het delen meteen.
        </p>
        {error && <p className="an-delen-error">{error}</p>}
        {users.length === 0 && !error ? (
          <p className="an-delen-hint">{loaded ? 'Geen andere accounts gevonden.' : 'Laden…'}</p>
        ) : (
          <>
            <ul className="an-delen-list">
              {users.map((u) => (
                <li key={u.id}>
                  <label className="an-delen-row">
                    <input type="checkbox" checked={shared.has(u.id)} onChange={() => toggle(u.id)} />
                    {u.name}
                  </label>
                </li>
              ))}
            </ul>
            <button type="button" onClick={save} disabled={busy} className="an-delen-save">
              {busy ? 'Bewaren…' : 'Delen bewaren'}
            </button>
          </>
        )}
      </div>
    </details>
  )
}
