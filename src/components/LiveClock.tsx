'use client'

import { fmtClock, useLiveClock } from '@/lib/use-live-clock'

// Lichtgewicht tikkende klok voor de matchlijst — rekent vanaf clockUpdatedAt (geen SSE).
export function LiveClock({
  half,
  seconds,
  running,
  updatedAt,
}: {
  half: number
  seconds: number
  running: boolean
  updatedAt: string | null
}) {
  const now = useLiveClock({ seconds, running, updatedAt })
  return (
    <span>
      H{half} {fmtClock(now)}
    </span>
  )
}
