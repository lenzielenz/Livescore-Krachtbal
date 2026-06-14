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
}: {
  matchId: number
  status: string
  loggedIn: boolean
  hasClub: boolean
  homeName: string
  awayName: string
  initialHome: number | null
  initialAway: number | null
}) {
  const [home, setHome] = useState('')
  const [away, setAway] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [locked, setLocked] = useState<{ home: number; away: number } | null>(initialHome != null && initialAway != null ? { home: initialHome, away: initialAway } : null)

  if (status !== 'scheduled' && status !== 'live') return null // na afloop gesloten

  const Wrap = ({ children }: { children: React.ReactNode }) => (
    <section className="pn">
      <h3 className="pn-h">🔮 Pronostiek{status === 'live' && <span className="pn-live">· match bezig</span>}</h3>
      {children}
    </section>
  )

  if (!loggedIn) {
    return <Wrap><p className="pn-note"><Link href="/inloggen">Log in</Link> om je uitslag door te geven en mee te doen voor het klassement.</p></Wrap>
  }
  if (!hasClub) {
    return <Wrap><p className="pn-note">Koppel je account aan je club om mee te pronostieken.</p></Wrap>
  }
  if (locked) {
    return (
      <Wrap>
        <div className="pn-done">
          <span className="pn-check">✓</span>
          <span className="pn-done-txt">
            <strong>Pronostiek binnen</strong>
            <span className="pn-secret">{homeName} <b>{locked.home}–{locked.away}</b> {awayName} · enkel jij ziet dit</span>
          </span>
        </div>
      </Wrap>
    )
  }

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

  return (
    <Wrap>
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
    </Wrap>
  )
}
