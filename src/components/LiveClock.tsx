'use client'

import { useEffect, useState } from 'react'

function fmt(total: number): string {
  const s = Math.max(0, Math.floor(total))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

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
  const baseAt = running && updatedAt ? new Date(updatedAt).getTime() : null
  const [now, setNow] = useState<number>(seconds)

  useEffect(() => {
    if (!running || baseAt === null) {
      setNow(seconds)
      return
    }
    const tick = () => setNow(seconds + (Date.now() - baseAt) / 1000)
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [running, baseAt, seconds])

  return (
    <span>
      H{half} {fmt(now)}
    </span>
  )
}
