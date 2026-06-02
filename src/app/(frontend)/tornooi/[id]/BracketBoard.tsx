'use client'

import Link from 'next/link'

import type { TMatchState, TournamentState } from '@/lib/tournament-engine'
import { fmtClock, useTicking, useTournamentStream } from '../useTournament'

function statusBadge(m: TMatchState): { text: string; cls: string } {
  if (m.status === 'live') return { text: 'LIVE', cls: 'live' }
  if (m.status === 'finished') return { text: 'EINDE', cls: 'done' }
  return { text: 'TE SPELEN', cls: 'pending' }
}

function MatchCard({ id, m }: { id: number; m: TMatchState }) {
  const clock = useTicking(m.clockSeconds, m.clockRunning)
  const badge = statusBadge(m)
  const bye = m.status === 'finished' && (!m.home || !m.away)
  const homeWon = m.winner === 'home'
  const awayWon = m.winner === 'away'

  return (
    <div className={`trn-match ${m.status}`}>
      <div className="trn-match-head">
        <span className="trn-match-label">{m.label}</span>
        <span className={`trn-match-badge ${badge.cls}`}>
          {m.status === 'live' ? `LIVE · H${m.currentHalf} ${fmtClock(clock)}` : bye ? 'BYE' : badge.text}
        </span>
      </div>
      <div className={`trn-match-team ${homeWon ? 'won' : ''}`}>
        <span className="nm">{m.home ?? '— te bepalen —'}</span>
        <span className="sc">{m.home ? m.score.home : ''}</span>
      </div>
      <div className={`trn-match-team ${awayWon ? 'won' : ''}`}>
        <span className="nm">{m.away ?? '— te bepalen —'}</span>
        <span className="sc">{m.away ? m.score.away : ''}</span>
      </div>
      {!bye && (
        <div className="trn-match-actions">
          <Link href={`/tornooi/${id}/aantekenen/${m.id}`} className="trn-mini">Aantekenen</Link>
          <Link href={`/tornooi/${id}/veld/${m.id}`} className="trn-mini">Veld</Link>
        </div>
      )}
    </div>
  )
}

export function BracketBoard({ id, initial }: { id: number; initial: TournamentState }) {
  const state = useTournamentStream(id, initial) ?? initial

  return (
    <div className="trn-page">
      <header className="trn-top">
        <Link href="/tornooi" className="trn-home">
          <span className="brand">Krachtbal</span> Live · {state.name}
        </Link>
        <nav className="trn-topnav">
          <Link href={`/tornooi/${id}/kantine`} className="trn-btn">Kantinescherm</Link>
          <Link href="/tornooi" className="trn-toplink">Alle tornooien</Link>
        </nav>
      </header>

      {state.champion && (
        <div className="trn-champion">🏆 Winnaar: <strong>{state.champion}</strong></div>
      )}

      <main className="trn-bracket">
        {state.rounds.map((r) => (
          <section key={r.round} className="trn-col">
            <h2 className="trn-col-title">{r.label}</h2>
            <div className="trn-col-matches">
              {r.matches.map((m) => (
                <MatchCard key={m.id} id={id} m={m} />
              ))}
            </div>
          </section>
        ))}
        {state.thirdPlace && (
          <section className="trn-col third">
            <h2 className="trn-col-title">Kleine finale</h2>
            <div className="trn-col-matches">
              <MatchCard id={id} m={state.thirdPlace} />
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
