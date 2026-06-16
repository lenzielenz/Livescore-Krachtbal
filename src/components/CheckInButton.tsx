'use client'

import { useState } from 'react'

import './checkin.css'

// "Ik ben erbij"-knop op de wedstrijdpagina: supporters geven aan dat ze de match bijwoonden.
// Voedt het seizoenspaspoort. Enkel zichtbaar/bruikbaar voor ingelogde supporters.
export function CheckInButton({ matchId, initial }: { matchId: number; initial: boolean }) {
  const [on, setOn] = useState(initial)
  const [busy, setBusy] = useState(false)

  const toggle = async () => {
    if (busy) return
    setBusy(true)
    const prev = on
    setOn(!prev) // optimistisch
    try {
      const res = await fetch(`/api/match/${matchId}/checkin`, { method: 'POST', credentials: 'include' })
      const data = (await res.json().catch(() => ({}))) as { checkedIn?: boolean }
      if (res.ok && typeof data.checkedIn === 'boolean') setOn(data.checkedIn)
      else setOn(prev)
    } catch {
      setOn(prev)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button type="button" className={`checkin-btn ${on ? 'on' : ''}`} onClick={() => void toggle()} disabled={busy} aria-pressed={on}>
      {on ? '✓ Je was erbij' : '🙋 Ik ben erbij'}
    </button>
  )
}
