'use client'

import { useCallback, useEffect, useState } from 'react'

import { toast } from '@/components/Toaster'

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
  favorites?: number[]
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
  const [favorites, setFavorites] = useState<number[]>([])
  const [showBlocked, setShowBlocked] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/matchsheet/${matchId}/lineup?side=${side}`)
    const json: RosterResponse = await res.json()
    setData(json)
    const favs = json.favorites ?? []
    setFavorites(favs)
    // Voorvullen, in volgorde: huidige opstelling → vaste opstelling (favorieten) → voorstel.
    const current = json.current?.map((c) => c.player).filter((p): p is number => typeof p === 'number') ?? []
    if (current.length) setSelected(new Set(current))
    else if (favs.length) setSelected(new Set(favs))
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

  const save = async (asFavorite: boolean) => {
    if (!data) return
    setSaving(true)
    setMsg(null)
    const players = data.players
      .filter((p) => selected.has(p.id))
      .map((p) => ({ player: p.id, rugnummer: p.shirtNumber }))
    const res = await fetch(`/api/matchsheet/${matchId}/lineup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ side, players, saveFavorites: asFavorite }),
    })
    const json = await res.json()
    setSaving(false)
    if (res.ok) {
      if (asFavorite) setFavorites(players.map((p) => p.player))
      const ok = asFavorite ? `Bewaard én onthouden als vaste opstelling (${json.saved}).` : `Bewaard (${json.saved} spelers).`
      setMsg(ok)
      toast('success', ok)
    } else {
      const err = json.error || 'Opslaan mislukt.'
      setMsg(err)
      toast('error', err)
    }
  }

  if (!data) return <section className="wb-card">Laden…</section>
  if (data.error) return <section className="wb-card">{data.error}</section>

  const visible = data.players.filter((p) => showBlocked || p.selectability.level !== 'block')
  const blockedCount = data.players.filter((p) => p.selectability.level === 'block').length
  const favSet = new Set(favorites)
  const sameAsFav = favorites.length > 0 && favorites.length === selected.size && favorites.every((id) => selected.has(id))

  return (
    <section className={`wb-card side-${side}`}>
      <h2>{label}</h2>
      <p className="wb-sub">
        Categorie {data.category} · status: <span className="wb-status">{data.status}</span> · {selected.size} geselecteerd
      </p>

      {/* Snelacties: in één klik de vaste opstelling invullen of alles wissen. */}
      <div className="ops-quick">
        <button
          type="button"
          className="ops-quick-btn"
          disabled={favorites.length === 0}
          onClick={() => setSelected(new Set(favorites))}
          title={favorites.length === 0 ? 'Nog geen vaste opstelling bewaard' : 'Vul de onthouden vaste opstelling in'}
        >
          ★ Vaste opstelling{favorites.length ? ` (${favorites.length})` : ''}
        </button>
        <button type="button" className="ops-quick-btn" disabled={selected.size === 0} onClick={() => setSelected(new Set())}>
          Wissen
        </button>
      </div>

      {blockedCount > 0 && (
        <label className="ops-blocked-toggle">
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
            {favSet.has(p.id) && <span className="wb-tag" title="Vaste opstelling">★</span>}
            {!favSet.has(p.id) && p.suggested && <span className="wb-tag">voorstel</span>}
          </li>
        ))}
      </ul>

      <div className="ops-save">
        <button type="button" onClick={() => save(false)} disabled={saving} className="wb-btn wb-btn-primary">
          {saving ? 'Bewaren…' : 'Opstelling bewaren'}
        </button>
        <button
          type="button"
          onClick={() => save(true)}
          disabled={saving || selected.size === 0 || sameAsFav}
          className="wb-btn"
          title="Onthoud deze opstelling voor de volgende wedstrijden van deze ploeg"
        >
          ★ Bewaar als vaste opstelling
        </button>
      </div>
      {msg && <p className="wb-msg">{msg}</p>}
    </section>
  )
}
