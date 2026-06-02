'use client'

import { useEffect, useRef, useState } from 'react'

import type { TournamentState } from '@/lib/tournament-engine'

/** Abonneer op de SSE-stream van een tornooi; start met de server-snapshot. */
export function useTournamentStream(id: number, initial: TournamentState | null): TournamentState | null {
  const [state, setState] = useState<TournamentState | null>(initial)
  useEffect(() => {
    const es = new EventSource(`/api/tournament/${id}/stream`)
    es.addEventListener('update', (e) => {
      try {
        setState(JSON.parse((e as MessageEvent).data) as TournamentState)
      } catch {
        /* negeer kapotte payload */
      }
    })
    return () => es.close()
  }, [id])
  return state
}

/** Laat de klok lokaal doortikken tussen de SSE-updates. */
export function useTicking(seconds: number, running: boolean): number {
  const [now, setNow] = useState(seconds)
  const base = useRef({ s: seconds, at: Date.now() })
  useEffect(() => {
    base.current = { s: seconds, at: Date.now() }
    setNow(seconds)
  }, [seconds, running])
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setNow(base.current.s + (Date.now() - base.current.at) / 1000), 250)
    return () => clearInterval(t)
  }, [running])
  return now
}

export function fmtClock(total: number): string {
  const s = Math.max(0, Math.floor(total))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
