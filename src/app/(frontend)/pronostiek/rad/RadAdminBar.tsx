'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

// Beheerder-bediening op het bonusrad: wis je eigen testboosters (toont de verse winnaar-staat) en
// een knop om de pagina te vernieuwen.
export function RadAdminBar() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const reset = async () => {
    if (busy) return
    setBusy(true)
    try {
      await fetch('/api/pronostiek/reset', { method: 'POST', credentials: 'include' })
    } catch {}
    setBusy(false)
    router.refresh()
  }

  return (
    <div className="rad-admin">
      <button type="button" className="rad-admin-btn" onClick={reset} disabled={busy}>
        {busy ? 'Bezig…' : '🧹 Wis testboosters'}
      </button>
      <button type="button" className="rad-admin-btn" onClick={() => router.refresh()}>↻ Vernieuwen</button>
    </div>
  )
}
