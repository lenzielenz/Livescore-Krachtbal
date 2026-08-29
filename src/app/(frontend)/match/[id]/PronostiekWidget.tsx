'use client'

import Link from 'next/link'
import { useState } from 'react'

import './pronostiek-widget.css'

// Pronostiek-widget op de matchpagina: geef je exacte uitslag door. Eens ingediend → ✓ vergrendeld,
// niemand ziet je tip. Voorspellen kan tot tijdens de match; hoe later, hoe minder punten.

// Eén ploegkolom van het formulier: naam, groot cijfer en − / + knoppen eromheen.
function Stepper({
  naam,
  waarde,
  zet,
  away = false,
}: {
  naam: string
  waarde: string
  zet: (v: string) => void
  away?: boolean
}) {
  const n = Number(waarde)
  const num = Number.isInteger(n) && n >= 0 ? n : 0
  const stap = (d: number) => zet(String(Math.min(199, Math.max(0, num + d))))
  return (
    <div className={`pn-col${away ? ' away' : ''}`}>
      <span className="pn-team">{naam}</span>
      <div className="pn-stepper">
        <button type="button" className="pn-step" onClick={() => stap(-1)} disabled={num <= 0} aria-label={`Eén minder voor ${naam}`}>
          −
        </button>
        <input
          className="pn-score"
          type="number"
          min={0}
          max={199}
          inputMode="numeric"
          value={waarde}
          onChange={(e) => zet(e.target.value)}
          onFocus={(e) => e.target.select()}
          aria-label={`Jouw voorspelling ${naam}`}
        />
        <button type="button" className="pn-step" onClick={() => stap(1)} aria-label={`Eén meer voor ${naam}`}>
          +
        </button>
      </div>
    </div>
  )
}
export function PronostiekWidget({
  matchId,
  status,
  loggedIn,
  homeName,
  awayName,
  initialHome,
  initialAway,
  remaining,
  max,
  boosterTokens,
  pronostiekOpen,
  openVanafTekst,
}: {
  matchId: number
  status: string
  loggedIn: boolean
  homeName: string
  awayName: string
  initialHome: number | null
  initialAway: number | null
  /** Resterende live-pronostieken deze speelweek. */
  remaining?: number
  /** Maximum per speelweek. */
  max?: number
  /** Gewonnen bonusrad-boosters (vermenigvuldigers) die de speler kan inzetten. */
  boosterTokens?: number[]
  /** Staat de pronostiek al open? (vanaf zondagmiddernacht vóór de speelweek — server beslist) */
  pronostiekOpen: boolean
  /** Leesbaar openingsmoment voor de gesloten-melding (bv. "maandag 14 september 2026"). */
  openVanafTekst?: string | null
}) {
  const fmtMult = (v: number) => `×${Number.isInteger(v) ? v : String(v).replace('.', ',')}`
  // Unieke boosterwaarden + hoeveel je er van hebt (bv. ×2 (2), ×5).
  const tokenCounts = (boosterTokens ?? []).reduce<Map<number, number>>((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map())
  const tokenChoices = [...tokenCounts.entries()].sort((a, b) => b[0] - a[0])
  const hasBooster = tokenChoices.length > 0
  // Tap-eerst invoer: de score begint op 0 en gaat met − / + omhoog of omlaag — typen hoeft
  // niet (maar kan wel: het cijfer zelf is een gewoon invoerveld).
  const [home, setHome] = useState('0')
  const [away, setAway] = useState('0')
  const [chosenBoost, setChosenBoost] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [locked, setLocked] = useState<{ home: number; away: number; boosted: number } | null>(initialHome != null && initialAway != null ? { home: initialHome, away: initialAway, boosted: 0 } : null)

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
        body: JSON.stringify({ matchId, home: h, away: a, boosterMult: chosenBoost ?? undefined }),
      })
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; boosterUsed?: number }
      if (!res.ok || !j.ok) throw new Error(j.error || 'Doorgeven mislukt.')
      setLocked({ home: h, away: a, boosted: Number(j.boosterUsed) || 0 })
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
        <span>Pronostiek binnen · <b>{locked.home}–{locked.away}</b> {locked.boosted > 1 ? <span className="pn-bonus">🎰 {fmtMult(locked.boosted)}</span> : null} <span className="pn-dim">(enkel jij ziet dit)</span></span>
      </div>
    )
  }
  if (status === 'scheduled' && !pronostiekOpen) {
    return (
      <div className="pn-line">
        <span className="pn-line-ic">🔮</span>
        <span>
          Pronostiek opent {openVanafTekst ? <>op <b>{openVanafTekst}</b></> : 'in de week van de wedstrijd'} — telkens vanaf zondagmiddernacht na het vorige speelweekend.
        </span>
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
  if (limitReached) {
    return (
      <div className="pn-line">
        <span className="pn-line-ic">🔮</span>
        <span>Je pronostieken zijn op — tot volgend weekend.</span>
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
        {typeof remaining === 'number' && (
          <span className="pn-left">nog {remaining}{max ? `/${max}` : ''} dit weekend</span>
        )}
      </h3>
      {/* Tap-eerst: twee kolommen met grote − / + knoppen rond het cijfer — niemand hoeft te
          typen of iets te lezen om dit te snappen. Het cijfer blijft wél een invoerveld voor wie
          liever tikt. */}
      <form className="pn-form" onSubmit={submit}>
        <Stepper naam={homeName} waarde={home} zet={setHome} />
        <span className="pn-dash" aria-hidden>–</span>
        <Stepper naam={awayName} waarde={away} zet={setAway} away />
        <button type="submit" className="pn-send" disabled={busy}>
          {busy ? '…' : '🎯 Ik gok hierop'}
        </button>
      </form>
      {hasBooster && (
        <div className="pn-boost">
          <span className="pn-boost-lbl">🎰 Booster:</span>
          <button type="button" className={`pn-boost-chip${chosenBoost == null ? ' on' : ''}`} onClick={() => setChosenBoost(null)}>Geen</button>
          {tokenChoices.map(([m, n]) => (
            <button key={m} type="button" className={`pn-boost-chip${chosenBoost === m ? ' on' : ''}`} onClick={() => setChosenBoost(m)}>
              {fmtMult(m)}{n > 1 ? ` ×${n}` : ''}
            </button>
          ))}
        </div>
      )}
      <p className="pn-hint">
        {status === 'live' ? '⏱ De match is bezig — hoe later je voorspelt, hoe minder punten.' : 'Je kan dit maar één keer doorgeven — daarna staat het vast.'} Niemand ziet je tip.
      </p>
      {err && <p className="pn-err">{err}</p>}
    </section>
  )
}
