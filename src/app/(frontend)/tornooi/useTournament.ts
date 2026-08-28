'use client'

import { useEffect, useRef, useState } from 'react'

import type { TournamentState } from '@/lib/tournament-engine'
import { useLiveStream } from '@/lib/use-live-stream'

/** Abonneer op de SSE-stream van een tornooi; start met de server-snapshot (met reconnect-backoff).
 * De setter laat een actie-antwoord (dat de verse state al meebrengt) direct toepassen, zodat de
 * gebruiker niet op de volgende stream-tik hoeft te wachten. */
export function useTournamentStream(
  id: number,
  initial: TournamentState | null,
): [TournamentState | null, (s: TournamentState) => void] {
  const [state, setState] = useState<TournamentState | null>(initial)
  useLiveStream<TournamentState>(`/api/tournament/${id}/stream`, (data) => setState(data))
  return [state, setState]
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
