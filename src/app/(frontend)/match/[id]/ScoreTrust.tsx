'use client'

import Link from 'next/link'
import { useCallback, useState } from 'react'

import type { TrustView } from '@/lib/score-trust'
import './score-trust.css'

type VoteKind = 'confirm' | 'dispute'
type Action = VoteKind | 'claim' | 'release'

/**
 * Vertrouwenspaneel onder het scorebord (enkel bij een vrije supporters-score).
 * Toont wie aantekent, hoe betrouwbaar de stand is, en laat andere kijkers bevestigen of
 * betwisten. De regels staan in src/lib/score-trust.ts; deze component doet enkel de UI.
 */
export function ScoreTrust({
  matchId,
  initial,
  loggedIn,
  initialMayClaim,
  initialMayVote,
  initialMyVote,
  isScorer,
}: {
  matchId: number
  initial: TrustView
  loggedIn: boolean
  initialMayClaim: boolean
  initialMayVote: boolean
  initialMyVote: VoteKind | null
  isScorer: boolean
}) {
  const [trust, setTrust] = useState<TrustView>(initial)
  const [myVote, setMyVote] = useState<VoteKind | null>(initialMyVote)
  const [mine, setMine] = useState(isScorer)
  const [canClaim, setCanClaim] = useState(initialMayClaim)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = useCallback(
    async (action: Action) => {
      if (busy) return
      setBusy(true)
      setError(null)
      try {
        const res = await fetch(`/api/match/${matchId}/trust`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        })
        const data = (await res.json()) as { error?: string; trust?: TrustView; myVote?: VoteKind | null }
        if (!res.ok || !data.trust) {
          setError(data.error ?? 'Er ging iets mis.')
          return
        }
        setTrust(data.trust)
        if (action === 'claim') {
          setMine(true)
          setCanClaim(true)
        } else if (action === 'release') {
          setMine(false)
        } else {
          setMyVote(data.myVote ?? null)
        }
      } catch {
        setError('Geen verbinding — probeer het opnieuw.')
      } finally {
        setBusy(false)
      }
    },
    [busy, matchId],
  )

  const total = trust.confirms + trust.disputes

  return (
    <section className={`trust-panel ${trust.label}`} aria-label="Betrouwbaarheid van de stand">
      <div className="trust-head">
        <span className="trust-label">
          <span aria-hidden>{trust.emoji}</span> {trust.short}
        </span>
        {trust.scorerName && (
          <span className="trust-scorer">
            ✏️ {trust.scorerName}
            {trust.claimActive ? '' : ' (niet meer actief)'}
          </span>
        )}
      </div>

      <p className="trust-long">{trust.long}</p>

      {total > 0 && (
        <p className="trust-counts">
          {trust.confirms > 0 && (
            <span className="trust-count ok">
              {trust.confirms} {trust.confirms === 1 ? 'kijker bevestigde' : 'kijkers bevestigden'} deze stand
            </span>
          )}
          {trust.disputes > 0 && (
            <span className="trust-count nok">
              {trust.disputes} {trust.disputes === 1 ? 'kijker betwist' : 'kijkers betwisten'} ze
            </span>
          )}
        </p>
      )}

      {!loggedIn ? (
        <p className="trust-login">
          <Link href="/inloggen">Log in</Link> om de stand te bevestigen of zelf aan te tekenen.
        </p>
      ) : (
        <div className="trust-actions">
          {initialMayVote && (
            <>
              <button
                type="button"
                className={`trust-btn ok ${myVote === 'confirm' ? 'on' : ''}`}
                onClick={() => void send('confirm')}
                disabled={busy}
              >
                👍 Klopt
              </button>
              <button
                type="button"
                className={`trust-btn nok ${myVote === 'dispute' ? 'on' : ''}`}
                onClick={() => void send('dispute')}
                disabled={busy}
              >
                👎 Klopt niet
              </button>
            </>
          )}
          {mine ? (
            <button type="button" className="trust-btn ghost" onClick={() => void send('release')} disabled={busy}>
              Aantekenen doorgeven
            </button>
          ) : (
            canClaim && (
              <button type="button" className="trust-btn ghost" onClick={() => void send('claim')} disabled={busy}>
                Ik teken aan
              </button>
            )
          )}
        </div>
      )}

      {error && <p className="trust-error">{error}</p>}
    </section>
  )
}
