'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type AnalyseClub = { id: number; name: string; logoUrl: string; colorPrimary: string }

async function call(method: 'POST' | 'PATCH' | 'DELETE', body: Record<string, unknown>): Promise<string | null> {
  const res = await fetch('/api/analyse/clubs', {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (res.ok) return null
  const data = await res.json().catch(() => ({}))
  return data.error || 'Er ging iets mis.'
}

// Beheer van de eigen analyse-clubs: aanmaken, hernoemen (inline) en verwijderen. Verwijderen ruimt
// — via de Clubs-hook — ook de ploegen/spelers/analysewedstrijden van die club mee op.
export function AnalyseClubsManager({ clubs }: { clubs: AnalyseClub[] }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')

  const add = async () => {
    if (!name.trim()) return
    setBusy(true)
    setErr(null)
    const error = await call('POST', { name: name.trim() })
    setBusy(false)
    if (error) { setErr(error); return }
    setName('')
    router.refresh()
  }

  const saveEdit = async (id: number) => {
    if (!editName.trim()) return
    setBusy(true)
    setErr(null)
    const error = await call('PATCH', { id, name: editName.trim() })
    setBusy(false)
    if (error) { setErr(error); return }
    setEditId(null)
    router.refresh()
  }

  const remove = async (c: AnalyseClub) => {
    if (!window.confirm(`Club "${c.name}" en al haar ploegen/spelers verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return
    setBusy(true)
    setErr(null)
    const error = await call('DELETE', { id: c.id })
    setBusy(false)
    if (error) { setErr(error); return }
    router.refresh()
  }

  return (
    <div className="anb-panel" data-tone="home">
      <form className="anb-addrow" onSubmit={(e) => { e.preventDefault(); void add() }}>
        <input className="rang-picker" placeholder="Nieuwe clubnaam" value={name} onChange={(e) => setName(e.target.value)} aria-label="Clubnaam" />
        <button type="submit" className="sk-demo-cta" disabled={busy || !name.trim()}>➕ Club toevoegen</button>
      </form>
      {err && <p className="nam-error">{err}</p>}

      {clubs.length === 0 ? (
        <p className="empty">Nog geen clubs. Maak er hierboven een aan.</p>
      ) : (
        <ul className="anb-list">
          {clubs.map((c) => (
            <li key={c.id} className="anb-row">
              {editId === c.id ? (
                <form className="anb-editrow" onSubmit={(e) => { e.preventDefault(); void saveEdit(c.id) }}>
                  <input className="rang-picker" value={editName} onChange={(e) => setEditName(e.target.value)} aria-label="Nieuwe naam" autoFocus />
                  <button type="submit" className="anb-mini ok" disabled={busy}>✓</button>
                  <button type="button" className="anb-mini" onClick={() => setEditId(null)}>✕</button>
                </form>
              ) : (
                <>
                  <span className="anb-name">{c.name}</span>
                  <span className="anb-actions">
                    <button type="button" className="anb-mini" onClick={() => { setEditId(c.id); setEditName(c.name) }} aria-label="Hernoemen">✏️</button>
                    <button type="button" className="anb-mini danger" onClick={() => void remove(c)} aria-label="Verwijderen">🗑</button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
