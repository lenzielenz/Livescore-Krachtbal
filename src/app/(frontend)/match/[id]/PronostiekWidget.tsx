'use client'

import Link from 'next/link'
import { useState } from 'react'

import './pronostiek-widget.css'

// Pronostiek-widget op de matchpagina: geef je exacte uitslag door. Eens ingediend → ✓ vergrendeld,
// niemand ziet je tip. Voorspellen kan tot tijdens de match; hoe later, hoe minder punten.
export function PronostiekWidget({
  matchId,
  status,
  loggedIn,
  hasClub,
  homeName,
  awayName,
  initialHome,
  initialAway,
  remaining,
  max,
  bonus,
}: {
  matchId: number
  status: string
  loggedIn: boolean
  hasClub: boolean
  homeName: string
  awayName: string
  initialHome: number | null
  initialAway: number | null
  /** Resterende live-pronostieken deze speelweek. */
  remaining?: number
  /** Maximum per speelweek. */
  max?: number
  /** Puntenmultiplier via het bonusrad (1 = normaal, 2 = dubbele punten). */
  bonus?: number
}) {
  const isBonus = typeof bonus === 'number' && bonus >= 2
  const [home, setHome] = useState('')
  const [away, setAway] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [locked, setLocked] = useState<{ home: number; away: number } | null>(initialHome != null && initialAway != null ? { home: initialHome, away: initialAway } : null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const h = Number(home)
    const a = Number(away)
    if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0) {
      setErr('Geef een geldige uitslag.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/club/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ matchId, home: h, away: a }),
      })
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !j.ok) throw new Error(j.error || 'Doorgeven mislukt.')
      setLocked({ home: h, away: a })
    } catch (e2) {
      setErr((e2 as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (status !== 'scheduled' && status !== 'live') return null // na afloop gesloten

  // Niet-actief → één slank lijntje (geen grote doffe doos die de pagina volprop maakt).
  // Ingevuld: groen vinkje + je tip. Anders: een rustige hint.
  if (locked) {
    return (
      <div className="pn-line pn-line-done">
        <span className="pn-line-ic">✓</span>
        <span>Pronostiek binnen · <b>{locked.home}–{locked.away}</b> {isBonus && <span className="pn-bonus">✨ ×2</span>} <span className="pn-dim">(enkel jij ziet dit)</span></span>
      </div>
    )
  }
  const limitReached = typeof remaining === 'number' && remaining <= 0
  if (!loggedIn) {
    return (
      <div className="pn-line">
        <span className="pn-line-ic">🔮</span>
        <span><Link href="/inloggen">Log in</Link> en pronostikeer mee voor het klassement.</span>
      </div>
    )
  }
  if (!hasClub) {
    return (
      <div className="pn-line">
        <span className="pn-line-ic">🔮</span>
        <span>Koppel je account aan je club om mee te pronostikeren.</span>
      </div>
    )
  }
  if (limitReached) {
    return (
      <div className="pn-line">
        <span className="pn-line-ic">🔮</span>
        <span>Je pronostieken voor dit weekend zijn op — volgend weekend mag je weer.</span>
      </div>
    )
  }

  // Actief → het enige paneel dat blijft staan, subtiel opvallend met een zachte accentgloed.
  // Eén vaste <section> (geen inline-component): zo blijft het invoerveld gemount en behoudt het de
  // focus/het toetsenbord tussen toetsaanslagen door.
  return (
    <section className="pn pn-active">
      <h3 className="pn-h">
        <span className="pn-dot" aria-hidden />
        🔮 Pronostiek{status === 'live' && <span className="pn-live">· match bezig</span>}
        {isBonus && <span className="pn-bonus">✨ Dubbele punten</span>}
        {typeof remaining === 'number' && (
          <span className="pn-left">nog {remaining}{max ? `/${max}` : ''} dit weekend</span>
        )}
      </h3>
      <form className="pn-form" onSubmit={submit}>
        <span className="pn-team">{homeName}</span>
        <input className="pn-score" type="number" min={0} max={199} inputMode="numeric" value={home} onChange={(e) => setHome(e.target.value)} placeholder="–" aria-label={`Jouw voorspelling ${homeName}`} />
        <span className="pn-dash">–</span>
        <input className="pn-score" type="number" min={0} max={199} inputMode="numeric" value={away} onChange={(e) => setAway(e.target.value)} placeholder="–" aria-label={`Jouw voorspelling ${awayName}`} />
        <span className="pn-team away">{awayName}</span>
        <button type="submit" className="pn-send" disabled={busy}>{busy ? '…' : 'Doorgeven'}</button>
      </form>
      <p className="pn-hint">
        {status === 'live' ? '⏱ De match is bezig — hoe later je voorspelt, hoe minder punten.' : 'Je kan dit maar één keer doorgeven — daarna staat het vast.'} Niemand ziet je tip.
      </p>
      {err && <p className="pn-err">{err}</p>}
    </section>
  )
}
