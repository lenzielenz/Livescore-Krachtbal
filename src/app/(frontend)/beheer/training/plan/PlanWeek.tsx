'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import type { PlanSession } from '@/lib/training-plan'

// Zet de drie planweek-sessies om in echte, geplande trainingen (Trainingen) op gekozen dagen.
function nextMonday(): string {
  const d = new Date()
  const day = d.getDay() // 0=zo
  const add = ((8 - day) % 7) || 7 // eerstvolgende maandag (nooit vandaag)
  d.setDate(d.getDate() + add)
  return d.toISOString().slice(0, 10)
}
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export function PlanWeek({ club, reeks, sessions }: { club: number; reeks: string; sessions: PlanSession[] }) {
  const router = useRouter()
  const [start, setStart] = useState(nextMonday())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  if (sessions.length === 0) return null

  // Drie sessies, om de dag (ma/wo/vr-ritme) vanaf de startdag.
  const offsets = [0, 2, 4]

  const plan = async () => {
    setBusy(true)
    setMsg(null)
    try {
      for (let i = 0; i < sessions.length; i++) {
        const s = sessions[i]
        const datum = `${addDays(start, offsets[i] ?? i * 2)}T18:00`
        const notitie = `${s.title} — ${s.drills.map((d) => d.name).join(', ')}`
        const res = await fetch('/api/training/sessie', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ datum, club, reeks, aanwezigen: [], notitie }),
        })
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(j.error || 'Inplannen mislukt.')
        }
      }
      setMsg(`${sessions.length} trainingen ingepland ✓`)
      router.refresh()
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
      setTimeout(() => setMsg(null), 4000)
    }
  }

  return (
    <span className="tp-planweek">
      <label className="tp-planweek-lbl">
        Vanaf
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Startdag van de trainingsweek" />
      </label>
      <button type="button" className="tp-save" onClick={plan} disabled={busy}>
        {busy ? '⏳ Bezig…' : '🗓️ Plan deze week in'}
      </button>
      {msg && <span className="tp-savemsg">{msg}</span>}
    </span>
  )
}
