'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Claim/vrijgeven van een wedstrijd als verantwoordelijke voor je clubkant.
export function ClaimButton({ matchId, coachName, mine }: { matchId: number; coachName: string | null; mine: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function toggle(release: boolean) {
    setBusy(true)
    try {
      await fetch(`/api/club/match/${matchId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ release }),
      })
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  if (mine) {
    return (
      <button type="button" className="club-claim mine" disabled={busy} onClick={() => toggle(true)}>
        ✓ Jij — vrijgeven
      </button>
    )
  }
  if (coachName) {
    return (
      <span className="club-claimed">
        👤 {coachName}
        <button type="button" className="club-claim-take" disabled={busy} onClick={() => toggle(false)}>
          overnemen
        </button>
      </span>
    )
  }
  return (
    <button type="button" className="club-claim" disabled={busy} onClick={() => toggle(false)}>
      ✋ Ik neem deze
    </button>
  )
}
