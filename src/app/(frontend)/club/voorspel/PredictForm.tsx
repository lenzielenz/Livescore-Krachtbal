'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

// Eén voorspelling voor één wedstrijd: thuis–uit invoeren en bewaren (upsert).
export function PredictForm({
  matchId,
  homeName,
  awayName,
  initialHome,
  initialAway,
}: {
  matchId: number
  homeName: string
  awayName: string
  initialHome: number | null
  initialAway: number | null
}) {
  const router = useRouter()
  const [home, setHome] = useState(initialHome != null ? String(initialHome) : '')
  const [away, setAway] = useState(initialAway != null ? String(initialAway) : '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const saved = initialHome != null && initialAway != null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const h = Number(home)
    const a = Number(away)
    if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0) {
      setMsg('Geef een geldige uitslag.')
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/club/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ matchId, home: h, away: a }),
      })
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !j.ok) throw new Error(j.error || 'Bewaren mislukt.')
      setMsg('Bewaard ✓')
      router.refresh()
    } catch (err) {
      setMsg((err as Error).message)
    } finally {
      setBusy(false)
      setTimeout(() => setMsg(null), 3000)
    }
  }

  return (
    <form className="vs-form" onSubmit={submit}>
      <span className="vs-form-row">
        <input className="vs-score" type="number" min={0} max={199} inputMode="numeric" value={home} onChange={(e) => setHome(e.target.value)} aria-label={`Voorspelling ${homeName}`} placeholder="–" />
        <span className="vs-dash">–</span>
        <input className="vs-score" type="number" min={0} max={199} inputMode="numeric" value={away} onChange={(e) => setAway(e.target.value)} aria-label={`Voorspelling ${awayName}`} placeholder="–" />
        <button type="submit" className="vs-save" disabled={busy}>{busy ? '…' : saved ? 'Wijzig' : 'Voorspel'}</button>
      </span>
      {msg && <span className="vs-msg">{msg}</span>}
    </form>
  )
}
