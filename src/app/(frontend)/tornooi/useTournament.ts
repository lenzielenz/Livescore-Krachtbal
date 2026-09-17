'use client'

import { useState } from 'react'

import type { TournamentState } from '@/lib/tournament-engine'
import { fmtClock as fmtClockShared, useLiveClock } from '@/lib/use-live-clock'
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

/** Laat de klok lokaal doortikken tussen de SSE-updates. Tornooi-matches houden geen
 * `clockUpdatedAt` bij (enkel `seconds`/`running` per SSE-tik) — de gedeelde hook rekent dan vanaf
 * het moment waarop die waarden hier binnenkwamen, wat voor dit gebruik hetzelfde is. */
export function useTicking(seconds: number, running: boolean): number {
  return useLiveClock({ seconds, running })
}

export const fmtClock = fmtClockShared
