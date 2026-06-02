'use client'

import Link from 'next/link'

import type { TMatchState, TournamentState } from '@/lib/tournament-engine'
import { fmtClock, useTicking, useTournamentStream } from '../../useTournament'

// Compacte schema-kaart (read-only) voor het overzicht.
function MiniMatch({ m }: { m: TMatchState }) {
  const bye = m.status === 'finished' && (!m.home || !m.away)
  return (
    <div className={`kn-mini ${m.status}`}>
      <div className={`kn-mini-team ${m.winner === 'home' ? 'won' : ''}`}>
        <span>{m.home ?? '—'}</span>
        <b>{m.home ? m.score.home : ''}</b>
      </div>
      <div className={`kn-mini-team ${m.winner === 'away' ? 'won' : ''}`}>
        <span>{m.away ?? '—'}</span>
        <b>{m.away ? m.score.away : ''}</b>
      </div>
      <span className={`kn-mini-tag ${m.status}`}>
        {m.status === 'live' ? 'LIVE' : m.status === 'finished' ? (bye ? 'bye' : 'einde') : ''}
      </span>
    </div>
  )
}

// Grote live-tegel voor een wedstrijd die nu bezig is.
function LiveTile({ m }: { m: TMatchState }) {
  const clock = useTicking(m.clockSeconds, m.clockRunning)
  return (
    <div className="kn-live">
      <div className="kn-live-head">
        <span className="kn-live-label">{m.label}</span>
        <span className="kn-live-clock">H{m.currentHalf} · {fmtClock(clock)}</span>
      </div>
      <div className="kn-live-body">
        <span className="kn-live-team">{m.home}</span>
        <span className="kn-live-score">{m.score.home} – {m.score.away}</span>
        <span className="kn-live-team">{m.away}</span>
      </div>
    </div>
  )
}

export function TournamentKantine({ id, initial }: { id: number; initial: TournamentState }) {
  const state = useTournamentStream(id, initial) ?? initial
  const allMatches = [...state.rounds.flatMap((r) => r.matches), ...(state.thirdPlace ? [state.thirdPlace] : [])]
  const liveMatches = allMatches.filter((m) => m.status === 'live')

  return (
    <div className="trn-page kantine">
      <header className="trn-top">
        <Link href={`/tornooi/${id}`} className="trn-home">
          <span className="brand">Krachtbal</span> Live · {state.name} · Kantine
        </Link>
        <span className="trn-toplink">{state.champion ? `🏆 ${state.champion}` : 'Tornooi bezig'}</span>
      </header>

      <section className="kn-livebar">
        <h2>Nu bezig</h2>
        {liveMatches.length === 0 ? (
          <p className="trn-empty">Geen wedstrijd bezig.</p>
        ) : (
          <div className="kn-livegrid">
            {liveMatches.map((m) => (
              <LiveTile key={m.id} m={m} />
            ))}
          </div>
        )}
      </section>

      <section className="kn-bracket">
        <h2>Schema</h2>
        <div className="trn-bracket">
          {state.rounds.map((r) => (
            <div key={r.round} className="trn-col">
              <h3 className="trn-col-title">{r.label}</h3>
              <div className="trn-col-matches">
                {r.matches.map((m) => (
                  <MiniMatch key={m.id} m={m} />
                ))}
              </div>
            </div>
          ))}
          {state.thirdPlace && (
            <div className="trn-col third">
              <h3 className="trn-col-title">Kleine finale</h3>
              <div className="trn-col-matches">
                <MiniMatch m={state.thirdPlace} />
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
