'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import type { TMatchState, TournamentState } from '@/lib/tournament-engine'
import { fmtClock, useTicking } from '../../../useTournament'

function findMatch(state: TournamentState, matchId: number): TMatchState | null {
  for (const r of state.rounds) {
    const hit = r.matches.find((m) => m.id === matchId)
    if (hit) return hit
  }
  return state.thirdPlace?.id === matchId ? state.thirdPlace : null
}

export function TournamentFieldScreen({
  id,
  matchId,
  initial,
}: {
  id: number
  matchId: number
  initial: TournamentState
}) {
  const [state, setState] = useState<TournamentState>(initial)

  useEffect(() => {
    const es = new EventSource(`/api/tournament/${id}/stream`)
    es.addEventListener('update', (e) => {
      try {
        setState(JSON.parse((e as MessageEvent).data) as TournamentState)
      } catch {}
    })
    return () => es.close()
  }, [id])

  const m = findMatch(state, matchId)
  const clock = useTicking(m?.clockSeconds ?? 0, m?.clockRunning ?? false)

  if (!m) return <p className="trn-error">Wedstrijd niet gevonden.</p>

  const statusText =
    m.status === 'finished' ? 'EINDE' : m.status === 'live' ? `HELFT ${m.currentHalf}` : 'STARTKLAAR'

  return (
    <div className="tf-screen">
      <div className="tf-top">
        <span className="tf-tname">{state.name}</span>
        <span className="tf-round">{m.label}</span>
        <Link href={`/tornooi/${id}`} className="tf-back">⤺</Link>
      </div>

      <div className="tf-main">
        <div className={`tf-side ${m.winner === 'home' ? 'won' : ''}`}>
          <div className="tf-team">{m.home ?? '—'}</div>
          <div className="tf-score">{m.home ? m.score.home : '–'}</div>
        </div>

        <div className="tf-center">
          <div className={`tf-status ${m.status}`}>{statusText}</div>
          <div className="tf-clock">{m.status === 'pending' ? '00:00' : fmtClock(clock)}</div>
        </div>

        <div className={`tf-side ${m.winner === 'away' ? 'won' : ''}`}>
          <div className="tf-team">{m.away ?? '—'}</div>
          <div className="tf-score">{m.away ? m.score.away : '–'}</div>
        </div>
      </div>

      {m.status === 'finished' && (
        <div className="tf-foot">Winnaar: {m.winner === 'home' ? m.home : m.away}</div>
      )}
    </div>
  )
}
