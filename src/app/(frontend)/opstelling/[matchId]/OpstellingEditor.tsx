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

  if (!data) return <section style={cardStyle}>Laden…</section>
  if (data.error) return <section style={cardStyle}>{data.error}</section>

  const visible = data.players.filter((p) => showBlocked || p.selectability.level !== 'block')
  const blockedCount = data.players.filter((p) => p.selectability.level === 'block').length

  return (
    <section style={cardStyle}>
      <h2 style={{ margin: '0 0 4px' }}>{label}</h2>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: '#666' }}>
        Categorie {data.category} · status blad: <strong>{data.status}</strong> · {selected.size} geselecteerd
      </p>

      {blockedCount > 0 && (
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, marginBottom: 8 }}>
          <input type="checkbox" checked={showBlocked} onChange={(e) => setShowBlocked(e.target.checked)} />
          Toon {blockedCount} geblokkeerde leden (override)
        </label>
      )}

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {visible.map((p) => (
          <li
            key={p.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 8px',
              borderRadius: 6,
              background: selected.has(p.id) ? '#eef6ff' : '#fafafa',
              opacity: p.selectability.level === 'block' && !selected.has(p.id) ? 0.7 : 1,
            }}
            title={p.selectability.reasons.join(' ')}
          >
            <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
            <span
              aria-hidden
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: LEVEL_COLOR[p.selectability.level],
                flexShrink: 0,
              }}
            />
            <strong style={{ width: 28, textAlign: 'right' }}>{p.shirtNumber}</strong>
            <span style={{ flex: 1 }}>{p.name}</span>
            {p.suggested && <span style={{ fontSize: 11, color: '#3b82f6' }}>voorstel</span>}
          </li>
        ))}
      </ul>

      <button
        onClick={save}
        disabled={saving}
        className="btn btn--style-primary"
        style={{ marginTop: 12, padding: '8px 16px', cursor: 'pointer' }}
      >
        {saving ? 'Bewaren…' : 'Opstelling bewaren'}
      </button>
      {msg && <p style={{ marginTop: 8, fontSize: 13 }}>{msg}</p>}
    </section>
  )
}

const cardStyle: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  padding: 16,
  background: '#fff',
}
