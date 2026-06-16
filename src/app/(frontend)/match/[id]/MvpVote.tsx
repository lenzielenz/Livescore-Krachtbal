'use client'

import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'

import { tallyMvp, type MvpCandidate } from '@/lib/mvp-vote'
import { useLiveStream, useViewerId } from '@/lib/use-live-stream'
import './mvp-vote.css'

type Totals = Record<string, number>

export function MvpVote({
  matchId,
  candidates,
  teams,
  initialTotals,
  initialMyVote,
  canVote,
  loggedIn,
  finished,
}: {
  matchId: number
  candidates: MvpCandidate[]
  teams: { home: string; away: string; homeColor: string | null; awayColor: string | null }
  initialTotals: Totals
  initialMyVote: number | null
  canVote: boolean
  loggedIn: boolean
  finished: boolean
}) {
  const [totals, setTotals] = useState<Totals>(initialTotals)
  const [myVote, setMyVote] = useState<number | null>(initialMyVote)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Live: de stand schuift mee op de bestaande SSE-verbinding (event 'mvp').
  const viewerId = useViewerId()
  useLiveStream<unknown>(
    `/api/match/${matchId}/stream${viewerId ? `?v=${viewerId}` : ''}`,
    () => {},
    { mvp: (d) => setTotals(((d as { totals?: Totals }).totals) ?? {}) },
  )

  const result = useMemo(() => tallyMvp(candidates, totals), [candidates, totals])
  const colorFor = (side: 'home' | 'away') => (side === 'home' ? teams.homeColor : teams.awayColor) || 'var(--accent)'

  const vote = useCallback(
    async (playerId: number) => {
      if (busy || !canVote || playerId === myVote) return
      setBusy(true)
      setError(null)
      const prev = myVote
      // Optimistisch: oude stem eraf, nieuwe erbij.
      setTotals((t) => {
        const next = { ...t }
        if (prev != null) next[prev] = Math.max(0, (next[prev] ?? 0) - 1)
        next[playerId] = (next[playerId] ?? 0) + 1
        return next
      })
      setMyVote(playerId)
      try {
        const res = await fetch(`/api/match/${matchId}/mvp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || 'Stemmen lukte niet.')
        if (data?.totals) setTotals(data.totals as Totals)
      } catch (e) {
        // Terugdraaien bij fout.
        setMyVote(prev)
        setTotals((t) => {
          const next = { ...t }
          next[playerId] = Math.max(0, (next[playerId] ?? 0) - 1)
          if (prev != null) next[prev] = (next[prev] ?? 0) + 1
          return next
        })
        setError(e instanceof Error ? e.message : 'Stemmen lukte niet.')
      } finally {
        setBusy(false)
      }
    },
    [busy, canVote, myVote, matchId],
  )

  if (candidates.length === 0) return null

  return (
    <section className="mvp">
      <div className="mvp-head">
        <h2 className="mvp-title">🏆 Held van de match</h2>
        <span className="mvp-count">{result.total} {result.total === 1 ? 'stem' : 'stemmen'}</span>
      </div>

      {finished && result.winner && (
        <div className="mvp-winner" style={{ ['--mvp-c' as string]: colorFor(result.winner.side) }}>
          <span className="mvp-winner-crown" aria-hidden>👑</span>
          <span className="mvp-winner-txt">
            <b>{result.winner.shirtNumber != null ? `${result.winner.shirtNumber} ` : ''}{result.winner.name}</b>
            <i>verkozen tot held van de match</i>
          </span>
          <span className="mvp-winner-pct">{result.winner.pct}%</span>
        </div>
      )}

      {!loggedIn && (
        <p className="mvp-note"><Link href="/inloggen">Log in</Link> om mee te stemmen voor de held van de match.</p>
      )}
      {loggedIn && !canVote && !finished && <p className="mvp-note">Stemmen opent bij de aftrap.</p>}
      {loggedIn && !canVote && finished && <p className="mvp-note">De stembus is gesloten.</p>}
      {error && <p className="mvp-error">{error}</p>}

      <ul className="mvp-list">
        {result.standings.map((s, i) => {
          const mine = s.playerId === myVote
          const clickable = canVote && !mine
          return (
            <li key={s.playerId}>
              <button
                type="button"
                className={`mvp-row${mine ? ' is-mine' : ''}${s.leading && s.votes > 0 ? ' is-lead' : ''}`}
                style={{ ['--mvp-c' as string]: colorFor(s.side) }}
                onClick={() => vote(s.playerId)}
                disabled={!clickable || busy}
                aria-pressed={mine}
              >
                <span className="mvp-bar" style={{ width: `${s.pct}%` }} aria-hidden />
                <span className="mvp-rank">{result.total > 0 ? i + 1 : ''}</span>
                <span className="mvp-dot" aria-hidden />
                <span className="mvp-name">
                  {s.shirtNumber != null ? <i className="mvp-shirt">{s.shirtNumber}</i> : null}
                  {s.name}
                  <span className="mvp-team">{s.side === 'home' ? teams.home : teams.away}</span>
                </span>
                {mine && <span className="mvp-you">jouw stem ✓</span>}
                <span className="mvp-votes">{s.pct}%</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
