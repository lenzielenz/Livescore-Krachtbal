'use client'

import { useCallback, useEffect, useState } from 'react'

import { toast } from '@/components/Toaster'
import { LINEUP_MIN } from '@/lib/match-readiness'

const setsEqual = (a: Set<number>, b: Set<number>) => a.size === b.size && [...a].every((x) => b.has(x))

type RosterEntry = {
  id: number
  name: string
  shirtNumber: number
  vergunningsstatus: string
  selectability: { level: 'ok' | 'warn' | 'block'; reasons: string[] }
  suggested: boolean
}

type RosterResponse = {
  teamId: number
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
  // Wat is er als laatst bewaard? Zo weten we of er nog onbewaarde wijzigingen zijn (en kunnen we
  // duidelijk "klaar & bewaard" tonen i.p.v. de verwarrende technische status).
  const [savedSet, setSavedSet] = useState<Set<number>>(new Set())
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
    // Het reeds bewaarde (de huidige opstelling op het blad) is de referentie voor "bewaard?".
    setSavedSet(new Set(current))
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
      setSavedSet(new Set(selected))
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
        Categorie {data.category} · {selected.size} geselecteerd
      </p>

      {/* Duidelijke klaar-indicator: genoeg spelers + bewaard = groen "klaar". Zo weet je zeker dat
          het in orde is, i.p.v. te twijfelen bij de technische status. */}
      {(() => {
        const enough = selected.size >= LINEUP_MIN
        const dirty = !setsEqual(selected, savedSet)
        if (enough && !dirty) {
          return <div className="ops-ready ok">✓ Opstelling klaar en bewaard · {selected.size} spelers</div>
        }
        if (enough && dirty) {
          return <div className="ops-ready todo">{selected.size} spelers gekozen — tik op “Opstelling bewaren” om te bevestigen.</div>
        }
        return <div className="ops-ready need">Nog spelers nodig: {selected.size}/{LINEUP_MIN} minimum.</div>
      })()}

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
          Toon {blockedCount} niet-selecteerbare {blockedCount === 1 ? 'speler' : 'spelers'} (met reden)
        </label>
      )}

      <ul className="wb-rows">
        {visible.map((p) => {
          const blocked = p.selectability.level === 'block'
          // Toon de reden altijd zichtbaar (niet enkel als tooltip — die zie je niet op gsm), zodat
          // duidelijk is waaróm een speler (nog) niet gekozen kan worden, of waar je op moet letten.
          const reason = p.selectability.reasons.filter((r) => r !== 'Selecteerbaar.').join(' · ')
          return (
            <li
              key={p.id}
              className={`wb-row lvl-${p.selectability.level} ${selected.has(p.id) ? 'on' : ''} ${blocked ? 'blocked' : ''}`}
              onClick={() => {
                if (blocked) return // geblokkeerde spelers zijn zichtbaar maar niet selecteerbaar
                toggle(p.id)
              }}
              aria-disabled={blocked}
            >
              <input type="checkbox" readOnly checked={selected.has(p.id)} disabled={blocked} aria-label={`Selecteer ${p.name}`} />
              <span aria-hidden className="wb-dot" style={{ background: LEVEL_COLOR[p.selectability.level] }} />
              <strong className="num">{p.shirtNumber}</strong>
              <span className="nm">
                <span className="wb-nm-name">{p.name}</span>
                {reason && p.selectability.level !== 'ok' && <span className={`wb-reason lvl-${p.selectability.level}`}>{reason}</span>}
              </span>
              {favSet.has(p.id) && <span className="wb-tag" title="Vaste opstelling">★</span>}
              {!favSet.has(p.id) && p.suggested && <span className="wb-tag">voorstel</span>}
            </li>
          )
        })}
      </ul>

      {/* Spelers worden hier enkel geselecteerd uit de goedgekeurde ledenlijst — je kan ze niet
          zelf intikken, want een speler moet eerst door de federatie gekeurd zijn. Een nieuw lid
          voeg je toe via "Spelers toevoegen" (Mijn club); daarna verschijnt hij hier in de lijst. */}
      <p className="ops-add-hint">
        Staat een speler niet in de lijst? Voeg hem eerst toe via <strong>Spelers toevoegen</strong> in
        “Mijn club”. Na keuring door de federatie verschijnt hij hier vanzelf.
      </p>

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
