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
  confirmed?: boolean
  error?: string
}

const LEVEL_COLOR = { ok: '#22c55e', warn: '#f59e0b', block: '#ef4444' } as const

export function OpstellingEditor({
  matchId,
  side,
  label,
  onReadyChange,
}: {
  matchId: string
  side: 'home' | 'away'
  label: string
  /** Meldt of deze opstelling "klaar" is (bevestigd, of genoeg spelers én bewaard). */
  onReadyChange?: (ready: boolean) => void
}) {
  const [data, setData] = useState<RosterResponse | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  // Wat is er als laatst bewaard? Zo weten we of er nog onbewaarde wijzigingen zijn (en kunnen we
  // duidelijk "klaar & bewaard" tonen i.p.v. de verwarrende technische status).
  const [savedSet, setSavedSet] = useState<Set<number>>(new Set())
  const [favorites, setFavorites] = useState<number[]>([])
  // Bevestigd ("vergrendeld"): de opstelling is door de club als definitief aangeduid. Zichtbaar
  // verschil + de rijen zijn niet meer aanvinkbaar tot je ontgrendelt.
  const [confirmed, setConfirmed] = useState(false)
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
    setConfirmed(Boolean(json.confirmed))
  }, [matchId, side])

  useEffect(() => {
    load()
  }, [load])

  // Geef de klaar-status door aan de pagina, zodat die de knop naar de volgende stap kan tonen
  // zodra beide opstellingen in orde zijn. Zelfde definitie als de groene indicator hieronder.
  useEffect(() => {
    if (!data || data.error) return
    onReadyChange?.(confirmed || (selected.size >= LINEUP_MIN && setsEqual(selected, savedSet)))
  }, [data, confirmed, selected, savedSet, onReadyChange])

  // ⭐ Favoriet aan/uit: meteen bewaard op de ploeg, en de lijst herschikt (favorieten bovenaan).
  const zetFavoriet = async (player: number, aan: boolean) => {
    const res = await fetch(`/api/matchsheet/${matchId}/lineup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ side, favoriet: { player, aan } }),
    })
    const json = (await res.json().catch(() => ({}))) as { favorites?: number[]; error?: string }
    if (!res.ok) {
      toast('error', json.error ?? 'Favoriet bewaren mislukt.')
      return
    }
    const favs = json.favorites ?? []
    setFavorites(favs)
    const fav = new Set(favs)
    setData((d) =>
      d
        ? {
            ...d,
            players: [...d.players].sort((a, b) => {
              const ba = a.selectability.level === 'block' ? 1 : 0
              const bb = b.selectability.level === 'block' ? 1 : 0
              if (ba !== bb) return ba - bb
              return (fav.has(a.id) ? 0 : 1) - (fav.has(b.id) ? 0 : 1)
            }),
          }
        : d,
    )
  }

  const toggle = (id: number) => {
    if (confirmed) return // vergrendeld: eerst ontgrendelen om te wijzigen
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // `confirm`: undefined laat de bevestiging ongemoeid; true vergrendelt, false ontgrendelt.
  const save = async (asFavorite: boolean, confirm?: boolean) => {
    if (!data) return
    setSaving(true)
    setMsg(null)
    const players = data.players
      .filter((p) => selected.has(p.id))
      .map((p) => ({ player: p.id, rugnummer: p.shirtNumber }))
    const res = await fetch(`/api/matchsheet/${matchId}/lineup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ side, players, saveFavorites: asFavorite, confirmed: confirm }),
    })
    const json = await res.json()
    setSaving(false)
    if (res.ok) {
      if (asFavorite) setFavorites(players.map((p) => p.player))
      setSavedSet(new Set(selected))
      if (typeof confirm === 'boolean') setConfirmed(confirm)
      const ok =
        confirm === true
          ? `Opstelling bevestigd en vergrendeld (${json.saved} spelers).`
          : confirm === false
            ? 'Opstelling ontgrendeld — je kan ze weer aanpassen.'
            : asFavorite
              ? `Bewaard én onthouden als vaste opstelling (${json.saved}).`
              : `Bewaard (${json.saved} spelers).`
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

  const enough = selected.size >= LINEUP_MIN

  return (
    <section className={`wb-card side-${side}${confirmed ? ' ops-locked' : ''}`}>
      <h2>{label}</h2>
      <p className="wb-sub">
        Categorie {data.category} · {selected.size} geselecteerd
      </p>

      {/* Bevestigd? Dan een duidelijk vergrendeld-signaal (los van "bewaard"). Anders de gewone
          klaar-indicator: genoeg spelers + bewaard = groen "klaar". */}
      {confirmed ? (
        <div className="ops-ready locked">🔒 Opstelling bevestigd en vergrendeld · {selected.size} spelers</div>
      ) : (
        (() => {
          const dirty = !setsEqual(selected, savedSet)
          if (enough && !dirty) {
            return <div className="ops-ready ok">✓ Opstelling klaar en bewaard · {selected.size} spelers</div>
          }
          if (enough && dirty) {
            return <div className="ops-ready todo">{selected.size} spelers gekozen — tik op “Opstelling bewaren” om te bevestigen.</div>
          }
          return <div className="ops-ready need">Nog spelers nodig: {selected.size}/{LINEUP_MIN} minimum.</div>
        })()
      )}

      {/* Snelacties: in één klik de vaste opstelling invullen of alles wissen. Vergrendeld = uit. */}
      <div className="ops-quick">
        <button
          type="button"
          className="ops-quick-btn"
          disabled={confirmed || favorites.length === 0}
          onClick={() => setSelected(new Set(favorites))}
          title={favorites.length === 0 ? 'Nog geen vaste opstelling bewaard' : 'Vul de onthouden vaste opstelling in'}
        >
          ★ Vaste opstelling{favorites.length ? ` (${favorites.length})` : ''}
        </button>
        <button type="button" className="ops-quick-btn" disabled={confirmed || selected.size === 0} onClick={() => setSelected(new Set())}>
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
              {!favSet.has(p.id) && p.suggested && <span className="wb-tag">voorstel</span>}
              <button
                type="button"
                className={`ops-fav ${favSet.has(p.id) ? 'on' : ''}`}
                aria-pressed={favSet.has(p.id)}
                aria-label={favSet.has(p.id) ? `${p.name} geen favoriet meer` : `${p.name} als favoriet (bovenaan)`}
                title={favSet.has(p.id) ? 'Favoriet — staat bovenaan' : 'Maak favoriet: staat dan altijd bovenaan'}
                onClick={(e) => {
                  e.stopPropagation()
                  void zetFavoriet(p.id, !favSet.has(p.id))
                }}
              >
                {favSet.has(p.id) ? '★' : '☆'}
              </button>
            </li>
          )
        })}
      </ul>

      {/* Spelers worden hier enkel geselecteerd uit de goedgekeurde ledenlijst — je kan ze niet
          zelf intikken, want een speler moet eerst door de federatie gekeurd zijn. Een nieuw lid
          voeg je toe via "Spelers toevoegen" (Mijn club); daarna verschijnt hij hier in de lijst. */}
      <p className="ops-add-hint">
        Speler niet in de lijst? Voeg hem toe via <strong>Spelers toevoegen</strong> in “Mijn club” —
        na keuring verschijnt hij hier.
      </p>

      {confirmed ? (
        // Vergrendeld: enkel ontgrendelen kan nog. Bewaren/wijzigen is geblokkeerd tot dan.
        <div className="ops-save">
          <button type="button" onClick={() => save(false, false)} disabled={saving} className="wb-btn">
            {saving ? 'Bezig…' : '🔓 Opstelling ontgrendelen'}
          </button>
        </div>
      ) : (
        <div className="ops-save">
          <button type="button" onClick={() => save(false)} disabled={saving} className="wb-btn wb-btn-primary">
            {saving ? 'Bewaren…' : 'Opstelling bewaren'}
          </button>
          <button
            type="button"
            onClick={() => save(false, true)}
            disabled={saving || !enough}
            className="wb-btn wb-btn-confirm"
            title={enough ? 'Bevestig en vergrendel deze opstelling' : `Minstens ${LINEUP_MIN} spelers nodig om te bevestigen`}
          >
            🔒 Bevestigen &amp; vergrendelen
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
      )}
      {msg && <p className="wb-msg">{msg}</p>}
    </section>
  )
}
