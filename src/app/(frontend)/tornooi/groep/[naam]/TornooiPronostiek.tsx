'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

// 🔮 Supersimpele pronostiek op een tornooiwedstrijd: twee steppers, één tik op "Speel mijn tip".
// Bewust minimaal — je staat langs het veld met één hand vrij. Eenmaal doorgegeven staat de tip
// vast (zelfde regel als de competitie) en tonen we ze gewoon terug.
export function TornooiPronostiek({
  matchId,
  home,
  away,
  ingelogd,
  terug,
  bestaand,
}: {
  matchId: number
  home: string
  away: string
  ingelogd: boolean
  /** Pad om naar terug te keren na het inloggen. */
  terug: string
  bestaand?: { home: number; away: number } | null
}) {
  const [h, setH] = useState(0)
  const [a, setA] = useState(0)
  const [busy, setBusy] = useState(false)
  const [tip, setTip] = useState<{ home: number; away: number } | null>(bestaand ?? null)
  const [fout, setFout] = useState<string | null>(null)
  useEffect(() => {
    if (bestaand) setTip(bestaand)
  }, [bestaand])

  if (!ingelogd) {
    return (
      <Link href={`/inloggen?next=${encodeURIComponent(terug)}`} className="tp-knop">
        🔮 Speel mee — log in
      </Link>
    )
  }

  if (tip) {
    return (
      <span className="tp-gespeeld" title="Je tip staat vast">
        🔮 Jouw tip: <b>{tip.home}–{tip.away}</b>
      </span>
    )
  }

  const speel = async () => {
    setBusy(true)
    setFout(null)
    try {
      const res = await fetch('/api/tornooi-pronostiek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ matchId, home: h, away: a }),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(d.error || 'Doorgeven mislukt.')
      setTip({ home: h, away: a })
    } catch (e) {
      setFout((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="tp-wrap">
      <span className="tp-rij">
        <span className="tp-stepper" aria-label={`Voorspelling ${home}`}>
          <button type="button" onClick={() => setH((v) => Math.max(0, v - 1))} aria-label={`${home} min`}>−</button>
          <b>{h}</b>
          <button type="button" onClick={() => setH((v) => Math.min(99, v + 1))} aria-label={`${home} plus`}>+</button>
        </span>
        <i className="tp-vs">–</i>
        <span className="tp-stepper" aria-label={`Voorspelling ${away}`}>
          <button type="button" onClick={() => setA((v) => Math.max(0, v - 1))} aria-label={`${away} min`}>−</button>
          <b>{a}</b>
          <button type="button" onClick={() => setA((v) => Math.min(99, v + 1))} aria-label={`${away} plus`}>+</button>
        </span>
        <button type="button" className="tp-knop" disabled={busy} onClick={() => void speel()}>
          {busy ? '⏳' : '🔮 Speel mijn tip'}
        </button>
      </span>
      {fout && <span className="tp-fout">{fout}</span>}
    </span>
  )
}
