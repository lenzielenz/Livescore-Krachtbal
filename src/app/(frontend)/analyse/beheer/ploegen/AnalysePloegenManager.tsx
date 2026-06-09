'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export type ClubOption = { id: number; name: string }
export type AnalysePloeg = { id: number; name: string; reeks: string; reeksLabel: string; clubId: number | null; clubName: string }
type ReeksOption = { value: string; label: string }

async function call(method: 'POST' | 'PATCH' | 'DELETE', body: Record<string, unknown>): Promise<string | null> {
  const res = await fetch('/api/analyse/teams', {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (res.ok) return null
  const data = await res.json().catch(() => ({}))
  return data.error || 'Er ging iets mis.'
}

// Beheer van de eigen analyse-ploegen: aanmaken (naam + reeks + club), hernoemen en verwijderen.
// Ploegen worden per reeks gegroepeerd weergegeven.
export function AnalysePloegenManager({ ploegen, clubs, reeksOptions }: { ploegen: AnalysePloeg[]; clubs: ClubOption[]; reeksOptions: ReeksOption[] }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [reeks, setReeks] = useState(reeksOptions[0]?.value ?? '')
  const [clubId, setClubId] = useState(clubs[0]?.id ? String(clubs[0].id) : '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')

  const groups = useMemo(() => {
    const byReeks = new Map<string, AnalysePloeg[]>()
    for (const p of ploegen) {
      const arr = byReeks.get(p.reeksLabel) ?? []
      arr.push(p)
      byReeks.set(p.reeksLabel, arr)
    }
    return [...byReeks.entries()].sort((a, b) => a[0].localeCompare(b[0], 'nl'))
  }, [ploegen])

  const add = async () => {
    if (!name.trim() || !reeks || !clubId) return
    setBusy(true)
    setErr(null)
    const error = await call('POST', { name: name.trim(), reeks, clubId: Number(clubId) })
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

  const remove = async (p: AnalysePloeg) => {
    if (!window.confirm(`Ploeg "${p.name}" en haar spelers verwijderen?`)) return
    setBusy(true)
    setErr(null)
    const error = await call('DELETE', { id: p.id })
    setBusy(false)
    if (error) { setErr(error); return }
    router.refresh()
  }

  if (clubs.length === 0) {
    return (
      <p className="empty">
        Maak eerst een <Link href="/analyse/beheer/clubs" style={{ color: 'var(--accent)' }}>club</Link> aan — daar koppel je je ploegen aan.
      </p>
    )
  }

  return (
    <div className="anb-panel">
      <form className="anb-addrow wrap" onSubmit={(e) => { e.preventDefault(); void add() }}>
        <input className="rang-picker" placeholder="Ploegnaam" value={name} onChange={(e) => setName(e.target.value)} aria-label="Ploegnaam" />
        <select className="rang-picker" value={reeks} onChange={(e) => setReeks(e.target.value)} aria-label="Reeks">
          {reeksOptions.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
        <select className="rang-picker" value={clubId} onChange={(e) => setClubId(e.target.value)} aria-label="Club">
          {clubs.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
        </select>
        <button type="submit" className="sk-demo-cta" disabled={busy || !name.trim() || !reeks || !clubId}>➕ Ploeg toevoegen</button>
      </form>
      {err && <p className="nam-error">{err}</p>}

      {ploegen.length === 0 ? (
        <p className="empty">Nog geen ploegen. Maak er hierboven een aan.</p>
      ) : (
        groups.map(([reeksLabel, list]) => (
          <div key={reeksLabel} className="anb-group">
            <h3 className="anb-group-h">{reeksLabel}</h3>
            <ul className="anb-list">
              {list.map((p) => (
                <li key={p.id} className="anb-row">
                  {editId === p.id ? (
                    <form className="anb-editrow" onSubmit={(e) => { e.preventDefault(); void saveEdit(p.id) }}>
                      <input className="rang-picker" value={editName} onChange={(e) => setEditName(e.target.value)} aria-label="Nieuwe naam" autoFocus />
                      <button type="submit" className="anb-mini ok" disabled={busy}>✓</button>
                      <button type="button" className="anb-mini" onClick={() => setEditId(null)}>✕</button>
                    </form>
                  ) : (
                    <>
                      <span className="anb-name">{p.name}<span className="anb-sub">{p.clubName}</span></span>
                      <span className="anb-actions">
                        <button type="button" className="anb-mini" onClick={() => { setEditId(p.id); setEditName(p.name) }} aria-label="Hernoemen">✏️</button>
                        <button type="button" className="anb-mini danger" onClick={() => void remove(p)} aria-label="Verwijderen">🗑</button>
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  )
}
