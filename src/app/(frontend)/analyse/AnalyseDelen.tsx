'use client'

import { useMemo, useState } from 'react'

import { toast } from '@/components/Toaster'

type Account = { id: number; name: string; clubId: number | null }
type Club = { id: number; name: string }
type Rol = 'geen' | 'lezen' | 'bewerken'

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// Analyse delen: per account kies je tussen twee opties — 👁 alleen lezen (meekijken) of
// ✏️ meedoen & aanpassen (ook aantekenen/bewerken). De lijst laadt pas bij het openklappen en is
// doorzoekbaar + per club gegroepeerd (zelfde aanpak als het accounts-beheer), zodat ze beheersbaar
// blijft als er veel accounts zijn.
export function AnalyseDelen() {
  const [loaded, setLoaded] = useState(false)
  const [users, setUsers] = useState<Account[]>([])
  const [clubs, setClubs] = useState<Club[]>([])
  const [rollen, setRollen] = useState<Map<number, Rol>>(new Map())
  const [savedCount, setSavedCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set())

  const load = async () => {
    if (loaded) return
    setLoaded(true)
    try {
      const res = await fetch('/api/analyse/delen', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'Laden mislukt.')
      setUsers(json.users)
      setClubs(json.clubs ?? [])
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

  // Filter op naam, groepeer per club (alfabetisch, 'Zonder club' achteraan), sorteer leden op naam.
  const groups = useMemo(() => {
    const q = norm(query.trim())
    const filtered = q ? users.filter((u) => norm(u.name).includes(q)) : users
    const clubName = new Map(clubs.map((c) => [c.id, c.name]))
    const map = new Map<string, Account[]>()
    for (const u of filtered) {
      const k = u.clubId != null ? `c:${u.clubId}` : 'none'
      const arr = map.get(k) ?? []
      arr.push(u)
      map.set(k, arr)
    }
    const out = [...map.entries()].map(([key, list]) => ({
      key,
      label: key === 'none' ? 'Zonder club' : clubName.get(Number(key.slice(2))) ?? `Club ${key.slice(2)}`,
      list: [...list].sort((a, b) => norm(a.name).localeCompare(norm(b.name))),
    }))
    out.sort((a, b) => (a.key === 'none' ? 1 : b.key === 'none' ? -1 : a.label.localeCompare(b.label)))
    return out
  }, [users, clubs, query])

  // Bij zoeken of één enkele groep: alles open. Anders staan de clubs dichtgeklapt (beheersbaar).
  const forceOpen = query.trim() !== '' || groups.length <= 1
  const isOpen = (key: string) => forceOpen || openKeys.has(key)
  const toggle = (key: string) =>
    setOpenKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const sharedIn = (list: Account[]) => list.filter((u) => (rollen.get(u.id) ?? 'geen') !== 'geen').length

  const renderRow = (u: Account) => {
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
            <input
              className="an-delen-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Zoek op naam…"
              aria-label="Zoek account"
            />
            {groups.length === 0 ? (
              <p className="an-delen-hint">Geen accounts gevonden.</p>
            ) : (
              groups.map(({ key, label, list }) => {
                const open = isOpen(key)
                const shared = sharedIn(list)
                return (
                  <div key={key} className="an-delen-group">
                    <button
                      type="button"
                      className={`an-delen-group-head ${open ? 'is-open' : ''}`}
                      onClick={() => toggle(key)}
                      aria-expanded={open}
                    >
                      <span className="an-delen-chevron" aria-hidden>▸</span>
                      <span className="an-delen-group-label">{label}</span>
                      {shared > 0 && <span className="an-delen-shared">{shared} gedeeld</span>}
                      <span className="an-delen-count">{list.length}</span>
                    </button>
                    {open && <ul className="an-delen-list">{list.map(renderRow)}</ul>}
                  </div>
                )
              })
            )}
            <button type="button" onClick={save} disabled={busy} className="an-delen-save">
              {busy ? 'Bewaren…' : 'Delen bewaren'}
            </button>
          </>
        )}
      </div>
    </details>
  )
}
