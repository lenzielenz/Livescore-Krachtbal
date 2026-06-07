'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Claimen/vrijgeven van een wedstrijd als verantwoordelijke voor je clubkant, met een beleefde
// overname-aanvraag wanneer een collega de wedstrijd al claimde:
//   - vrij        → "✋ Ik neem deze"
//   - van jou     → "✓ Jij — vrijgeven" (+ goedkeuren/weigeren als iemand wil overnemen)
//   - van iemand  → naam + "🙋 Vraag over te nemen" (of "Aanvraag verstuurd ⏳" als jij al vroeg)
export function ClaimButton({
  matchId,
  coachName,
  mine,
  takeoverName,
  takeoverMine,
}: {
  matchId: number
  coachName: string | null
  mine: boolean
  takeoverName: string | null
  takeoverMine: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function act(action: 'claim' | 'release' | 'request' | 'approve' | 'deny' | 'cancel') {
    setBusy(true)
    try {
      await fetch(`/api/club/match/${matchId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action }),
      })
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  // Jij bent verantwoordelijke.
  if (mine) {
    return (
      <span className="club-claimed">
        <button type="button" className="club-claim mine" disabled={busy} onClick={() => act('release')}>
          ✓ Jij — vrijgeven
        </button>
        {takeoverName && (
          <span className="club-takeover-ask">
            🙋 {takeoverName} wil overnemen
            <button type="button" className="club-claim-take ok" disabled={busy} onClick={() => act('approve')}>
              Toestaan
            </button>
            <button type="button" className="club-claim-take" disabled={busy} onClick={() => act('deny')}>
              Weigeren
            </button>
          </span>
        )}
      </span>
    )
  }

  // Iemand anders is verantwoordelijke.
  if (coachName) {
    return (
      <span className="club-claimed">
        👤 {coachName}
        {takeoverMine ? (
          <span className="club-takeover-pending">
            ⏳ Aanvraag verstuurd
            <button type="button" className="club-claim-take" disabled={busy} onClick={() => act('cancel')}>
              intrekken
            </button>
          </span>
        ) : (
          <button type="button" className="club-claim-take" disabled={busy} onClick={() => act('request')}>
            🙋 Vraag over te nemen
          </button>
        )}
      </span>
    )
  }

  // Nog vrij.
  return (
    <button type="button" className="club-claim" disabled={busy} onClick={() => act('claim')}>
      ✋ Ik neem deze
    </button>
  )
}
