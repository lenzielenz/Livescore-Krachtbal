'use client'

import Link from 'next/link'

import type { TMatchState, TournamentState } from '@/lib/tournament-engine'
import { fmtClock, useTicking, useTournamentStream } from '../useTournament'

// Twee opeenvolgende wedstrijden vormen een paar dat naar één wedstrijd in de volgende ronde
// leidt — die paring tekent de verbindingslijnen (zie tornooi.css).
function pairUp(matches: TMatchState[]): TMatchState[][] {
  const out: TMatchState[][] = []
  for (let i = 0; i < matches.length; i += 2) out.push(matches.slice(i, i + 2))
  return out
}

function MatchCard({ id, m }: { id: number; m: TMatchState }) {
  const clock = useTicking(m.clockSeconds, m.clockRunning)
  const bye = m.status === 'finished' && (!m.home || !m.away)
  const live = m.status === 'live'
  const done = m.status === 'finished'

  const Row = ({ side }: { side: 'home' | 'away' }) => {
    const name = side === 'home' ? m.home : m.away
    const won = m.winner === side
    const lost = done && m.winner && m.winner !== side
    return (
      <div className={`trn-row ${won ? 'won' : ''} ${lost ? 'lost' : ''} ${side}`}>
        <span className="trn-row-name">{name ?? '— te bepalen —'}</span>
        <span className="trn-row-score">{name && (live || done) ? m.score[side] : ''}</span>
      </div>
    )
  }

  return (
    <div className={`trn-match ${m.status}`}>
      <div className="trn-match-head">
        <span className="trn-match-label">{m.label}</span>
        <span className={`trn-match-badge ${m.status}`}>
          {live ? `LIVE · H${m.currentHalf} ${fmtClock(clock)}` : bye ? 'BYE' : done ? 'EINDE' : 'TE SPELEN'}
        </span>
      </div>
      <Row side="home" />
      <Row side="away" />
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
        {state.rounds.map((r, ri) => {
          const isLast = ri === state.rounds.length - 1
          return (
            <section key={r.round} className={`trn-col ${isLast ? 'trn-col-last' : ''}`}>
              <h2 className="trn-col-title">{r.label}</h2>
              <div className="trn-col-body">
                {pairUp(r.matches).map((pair, pi) => (
                  <div className="trn-pair" key={pi}>
                    {pair.map((m) => (
                      <MatchCard key={m.id} id={id} m={m} />
                    ))}
                  </div>
                ))}
              </div>
            </section>
          )
        })}
      </main>

      {state.thirdPlace && (
        <section className="trn-third">
          <h2 className="trn-col-title">Kleine finale (3e plaats)</h2>
          <div className="trn-third-card">
            <MatchCard id={id} m={state.thirdPlace} />
          </div>
        </section>
      )}
    </div>
  )
}
