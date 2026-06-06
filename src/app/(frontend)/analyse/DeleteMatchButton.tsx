'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Verwijderknop op een analysewedstrijd-kaart (admin). Zit in een <Link>, dus we blokkeren de
// navigatie bij een klik en bevestigen eerst.
export function DeleteMatchButton({ matchId, label }: { matchId: number; label: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const del = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (busy) return
    if (!window.confirm(`Wedstrijd "${label}" en alle bijhorende data (worpen, balbezit, wedstrijdblad) definitief verwijderen?`)) return
    setBusy(true)
    try {
      const res = await fetch('/api/matches/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ matchId }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.ok) router.refresh()
      else {
        window.alert(json.error || 'Verwijderen mislukt.')
        setBusy(false)
      }
    } catch {
      window.alert('Netwerkfout — probeer opnieuw.')
      setBusy(false)
    }
  }

  return (
    <button type="button" className="an-del" onClick={del} disabled={busy} aria-label="Wedstrijd verwijderen" title="Verwijderen">
      {busy ? '…' : '🗑'}
    </button>
  )
}
