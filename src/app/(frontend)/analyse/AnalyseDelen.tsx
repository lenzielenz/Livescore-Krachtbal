'use client'

import { useState } from 'react'

import { toast } from '@/components/Toaster'

type Account = { id: number; name: string }
type Rol = 'geen' | 'lezen' | 'bewerken'

// Analyse delen: per account kies je tussen twee opties — 👁 alleen lezen (meekijken) of
// ✏️ meedoen & aanpassen (ook aantekenen/bewerken). De lijst laadt pas bij het openklappen.
export function AnalyseDelen() {
  const [loaded, setLoaded] = useState(false)
  const [users, setUsers] = useState<Account[]>([])
  const [rollen, setRollen] = useState<Map<number, Rol>>(new Map())
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
      const m = new Map<number, Rol>()
      for (const id of (json.lezen ?? []) as number[]) m.set(id, 'lezen')
      for (const id of (json.bewerken ?? []) as number[]) m.set(id, 'bewerken')
      setRollen(m)
      setSavedCount(((json.lezen ?? []) as number[]).length + ((json.bewerken ?? []) as number[]).length)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  // Tikken op een actieve rol zet ze weer uit; anders wissel je gewoon van rol.
  const kies = (id: number, rol: Exclude<Rol, 'geen'>) => {
    setRollen((prev) => {
      const next = new Map(prev)
      if (next.get(id) === rol) next.delete(id)
      else next.set(id, rol)
      return next
    })
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const lezen = [...rollen.entries()].filter(([, r]) => r === 'lezen').map(([id]) => id)
      const bewerken = [...rollen.entries()].filter(([, r]) => r === 'bewerken').map(([id]) => id)
      const res = await fetch('/api/analyse/delen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ lezen, bewerken }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'Bewaren mislukt.')
      const n = (json.lezen as number[]).length + (json.bewerken as number[]).length
      setSavedCount(n)
      toast('success', n ? `Gedeeld met ${n} account(s).` : 'Delen uitgezet.')
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
          wie mag jouw analyses zien of mee aanpassen{savedCount ? ` · gedeeld met ${savedCount}` : ''}
        </span>
      </summary>
      <div className="an-record-body">
        <p className="an-delen-hint">
          Per account kies je: <strong>👁 lezen</strong> (bekijkt jouw analysewedstrijden en -rapporten mee)
          of <strong>✏️ meedoen</strong> (mag ze ook aantekenen en aanpassen — nieuwe opnames met jouw ploegen
          komen in jouw set terecht). Nogmaals tikken zet het delen weer uit.
        </p>
        {error && <p className="an-delen-error">{error}</p>}
        {users.length === 0 && !error ? (
          <p className="an-delen-hint">{loaded ? 'Geen andere accounts gevonden.' : 'Laden…'}</p>
        ) : (
          <>
            <ul className="an-delen-list">
              {users.map((u) => {
                const rol = rollen.get(u.id) ?? 'geen'
                return (
                  <li key={u.id}>
                    <div className="an-delen-row an-delen-row-keuze">
                      <span className="an-delen-naam">{u.name}</span>
                      <span className="an-delen-opties">
                        <button
                          type="button"
                          className={`an-delen-opt ${rol === 'lezen' ? 'on' : ''}`}
                          onClick={() => kies(u.id, 'lezen')}
                          title="Mag jouw analyses bekijken (alleen-lezen)"
                        >
                          👁 Lezen
                        </button>
                        <button
                          type="button"
                          className={`an-delen-opt bewerken ${rol === 'bewerken' ? 'on' : ''}`}
                          onClick={() => kies(u.id, 'bewerken')}
                          title="Mag jouw analyses ook aantekenen en aanpassen"
                        >
                          ✏️ Meedoen
                        </button>
                      </span>
                    </div>
                  </li>
                )
              })}
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
