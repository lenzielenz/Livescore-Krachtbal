'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import type { PlanTarget } from '@/lib/training-plan'

// Schrijft de voorgestelde 6-weken-doelen in één klik weg naar de Trainingdoelen (upsert per
// metriek), zodat de progressie-balken er meteen tegen aflopen.
export function SavePlanGoals({ speler, targets }: { speler: number; targets: PlanTarget[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  if (targets.length === 0) return null

  const save = async () => {
    setBusy(true)
    setMsg(null)
    try {
      for (const t of targets) {
        const res = await fetch('/api/training/doel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action: 'set', speler, metriek: t.key, doel: t.target }),
        })
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(j.error || 'Opslaan mislukt.')
        }
      }
      setMsg('Doelen opgeslagen ✓')
      router.refresh()
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
      setTimeout(() => setMsg(null), 3500)
    }
  }

  return (
    <span className="tp-savewrap">
      <button type="button" className="tp-save" onClick={save} disabled={busy}>
        {busy ? '⏳ Bezig…' : '🎯 Zet als doelen'}
      </button>
      {msg && <span className="tp-savemsg">{msg}</span>}
    </span>
  )
}
