'use client'

import { useCallback, useEffect, useState } from 'react'

type RosterEntry = {
  id: number
  name: string
  shirtNumber: number
  vergunningsstatus: string
  selectability: { level: 'ok' | 'warn' | 'block'; reasons: string[] }
  suggested: boolean
}

type RosterResponse = {
  teamName: string
  category: string
  status: string
  players: RosterEntry[]
  current: { player?: number; rugnummer?: number }[]
  error?: string
}

const LEVEL_COLOR = { ok: '#22c55e', warn: '#f59e0b', block: '#ef4444' } as const

export function OpstellingEditor({
  matchId,
  side,
  label,
}: {
  matchId: string
  side: 'home' | 'away'
  label: string
}) {
  const [data, setData] = useState<RosterResponse | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [showBlocked, setShowBlocked] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/matchsheet/${matchId}/lineup?side=${side}`)
    const json: RosterResponse = await res.json()
    setData(json)
    // Voorselectie: huidige opstelling, anders het voorstel (suggested).
    const current = json.current?.map((c) => c.player).filter((p): p is number => typeof p === 'number') ?? []
    if (current.length) setSelected(new Set(current))
    else setSelected(new Set(json.players?.filter((p) => p.suggested).map((p) => p.id) ?? []))
  }, [matchId, side])

  useEffect(() => {
    load()
  }, [load])

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const save = async () => {
    if (!data) return
    setSaving(true)
    setMsg(null)
    const players = data.players
      .filter((p) => selected.has(p.id))
      .map((p) => ({ player: p.id, rugnummer: p.shirtNumber }))
    const res = await fetch(`/api/matchsheet/${matchId}/lineup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ side, players }),
    })
    const json = await res.json()
    setSaving(false)
    setMsg(res.ok ? `Bewaard (${json.saved} spelers).` : json.error || 'Opslaan mislukt.')
  }

  if (!data) return <section className="wb-card">Laden…</section>
  if (data.error) return <section className="wb-card">{data.error}</section>

  const visible = data.players.filter((p) => showBlocked || p.selectability.level !== 'block')
  const blockedCount = data.players.filter((p) => p.selectability.level === 'block').length

  return (
    <section className={`wb-card side-${side}`}>
      <h2>{label}</h2>
      <p className="wb-sub">
        Categorie {data.category} · status: <span className="wb-status">{data.status}</span> · {selected.size} geselecteerd
      </p>

      {blockedCount > 0 && (
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, marginBottom: 8, color: 'var(--dim)' }}>
          <input type="checkbox" checked={showBlocked} onChange={(e) => setShowBlocked(e.target.checked)} />
          Toon {blockedCount} geblokkeerde leden (override)
        </label>
      )}

      <ul className="wb-rows">
        {visible.map((p) => (
          <li
            key={p.id}
            className={`wb-row ${selected.has(p.id) ? 'on' : ''}`}
            onClick={() => toggle(p.id)}
            title={p.selectability.reasons.join(' ')}
          >
            <input type="checkbox" readOnly checked={selected.has(p.id)} aria-label={`Selecteer ${p.name}`} />
            <span aria-hidden className="wb-dot" style={{ background: LEVEL_COLOR[p.selectability.level] }} />
            <strong className="num">{p.shirtNumber}</strong>
            <span className="nm">{p.name}</span>
            {p.suggested && <span className="wb-tag">voorstel</span>}
          </li>
        ))}
      </ul>

      <button onClick={save} disabled={saving} className="wb-btn wb-btn-primary" style={{ marginTop: 14 }}>
        {saving ? 'Bewaren…' : 'Opstelling bewaren'}
      </button>
      {msg && <p className="wb-msg">{msg}</p>}
    </section>
  )
}
