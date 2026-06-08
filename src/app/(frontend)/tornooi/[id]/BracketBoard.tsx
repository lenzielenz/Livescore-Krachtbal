'use client'

import Link from 'next/link'

import { TeamLogo } from '@/components/TeamLogo'
import type { TMatchState, TournamentState } from '@/lib/tournament-engine'
import { fmtClock, useTicking, useTournamentStream } from '../useTournament'

// Twee opeenvolgende wedstrijden vormen een paar dat naar één wedstrijd in de volgende ronde
// leidt — die paring tekent de verbindingslijnen (zie tornooi.css).
function pairUp(matches: TMatchState[]): TMatchState[][] {
  const out: TMatchState[][] = []
  for (let i = 0; i < matches.length; i += 2) out.push(matches.slice(i, i + 2))
  return out
}

function MatchCard({ id, m, canManage, logos }: { id: number; m: TMatchState; canManage: boolean; logos: Record<string, string> }) {
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
        {name && <span className="trn-row-logo"><TeamLogo name={name} logoUrl={logos[name] ?? null} size="xs" /></span>}
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
      {!bye && canManage && (
        <div className="trn-match-actions">
          <Link href={`/tornooi/${id}/aantekenen/${m.id}`} className="trn-mini">Aantekenen</Link>
          <Link href={`/tornooi/${id}/veld/${m.id}`} className="trn-mini">Veld</Link>
        </div>
      )}
    </div>
  )
}

// Round-robin: live rangschikking (4/3/2 punten) + alle wedstrijden.
function RoundRobin({ id, state, canManage, logos }: { id: number; state: TournamentState; canManage: boolean; logos: Record<string, string> }) {
  const matches = state.rounds.flatMap((r) => r.matches)
  const standings = state.standings ?? []
  return (
    <div className="trn-rr">
      <section className="trn-rr-stand">
        <h2 className="trn-col-title">Rangschikking</h2>
        <table className="trn-table">
          <thead>
            <tr><th>#</th><th className="l">Ploeg</th><th>G</th><th>W</th><th>GL</th><th>V</th><th>Saldo</th><th>Ptn</th></tr>
          </thead>
          <tbody>
            {standings.map((s, i) => (
              <tr key={s.team} className={i === 0 && state.status === 'finished' ? 'leader' : ''}>
                <td>{i + 1}</td>
                <td className="l"><span className="trn-rr-team">{logos[s.team] && <TeamLogo name={s.team} logoUrl={logos[s.team]} size="xs" />}{s.team}</span></td>
                <td>{s.played}</td>
                <td>{s.won}</td>
                <td>{s.drawn}</td>
                <td>{s.lost}</td>
                <td>{s.gf}–{s.ga}</td>
                <td className="pts">{s.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="trn-rr-legend">Winst 4 · gelijkspel 3 · verlies 2 punten</p>
      </section>
      <section className="trn-rr-matches">
        <h2 className="trn-col-title">Wedstrijden</h2>
        <div className="trn-rr-grid">
          {matches.map((m) => (
            <MatchCard key={m.id} id={id} m={m} canManage={canManage} logos={logos} />
          ))}
        </div>
      </section>
    </div>
  )
}

export function BracketBoard({ id, initial, canManage = false, logos = {} }: { id: number; initial: TournamentState; canManage?: boolean; logos?: Record<string, string> }) {
  const state = useTournamentStream(id, initial) ?? initial

  // Tweezijdige boom: de finale (laatste ronde) staat centraal; elke eerdere ronde wordt in een
  // linker- en rechterhelft gesplitst die naar het midden toe groeien. Standaard-seeding zorgt dat
  // de eerste helft van een ronde uit de eerste helft van de vorige voortkomt, dus de splitsing op
  // index is consistent over de rondes heen.
  const R = state.rounds.length
  const finalRound = R > 0 ? state.rounds[R - 1] : null
  const sideRounds = R > 1 ? state.rounds.slice(0, R - 1) : []
  const halfOf = (n: number) => Math.ceil(n / 2)
  const leftCols = sideRounds
    .map((r) => ({ round: r.round, label: r.label, matches: r.matches.slice(0, halfOf(r.matches.length)) }))
    .filter((c) => c.matches.length > 0)
  const rightCols = sideRounds
    .map((r) => ({ round: r.round, label: r.label, matches: r.matches.slice(halfOf(r.matches.length)) }))
    .filter((c) => c.matches.length > 0)

  const renderColumn = (c: { round: number; label: string; matches: TMatchState[] }, prefix: string) => (
    <section key={`${prefix}${c.round}`} className="trn-col">
      <h2 className="trn-col-title">{c.label}</h2>
      <div className="trn-col-body">
        {pairUp(c.matches).map((pair, pi) => (
          <div className="trn-pair" key={pi}>
            {pair.map((m) => (
              <MatchCard key={m.id} id={id} m={m} canManage={canManage} logos={logos} />
            ))}
          </div>
        ))}
      </div>
    </section>
  )

  return (
    <div className="trn-page">
      <header className="trn-top">
        <Link href="/tornooi" className="trn-home">
          <span className="brand">Krachtbal</span> Live · {state.name}
        </Link>
        <nav className="trn-topnav">
          <Link href={`/tornooi/${id}/kantine`} className="trn-btn">Kantinescherm</Link>
          <Link href="/tornooi" className="trn-toplink">Alle bekers</Link>
        </nav>
      </header>

      {state.champion && (
        <div className="trn-champion">🏆 Winnaar: {logos[state.champion] && <TeamLogo name={state.champion} logoUrl={logos[state.champion]} size="sm" />}<strong>{state.champion}</strong></div>
      )}

      {state.format === 'roundrobin' ? (
        <RoundRobin id={id} state={state} canManage={canManage} logos={logos} />
      ) : (
        <main className="trn-bracket2">
          {leftCols.length > 0 && <div className="trn-side trn-side-left">{leftCols.map((c) => renderColumn(c, 'l'))}</div>}
          {finalRound && finalRound.matches.length > 0 && (
            <div className="trn-center">
              <h2 className="trn-col-title trn-final-title">{finalRound.label}</h2>
              <div className="trn-center-body">
                {finalRound.matches.map((m) => (
                  <MatchCard key={m.id} id={id} m={m} canManage={canManage} logos={logos} />
                ))}
              </div>
            </div>
          )}
          {rightCols.length > 0 && <div className="trn-side trn-side-right">{rightCols.map((c) => renderColumn(c, 'r'))}</div>}
        </main>
      )}

      {state.format !== 'roundrobin' && state.thirdPlace && (
        <section className="trn-third">
          <h2 className="trn-col-title">Kleine finale (3e plaats)</h2>
          <div className="trn-third-card">
            <MatchCard id={id} m={state.thirdPlace} canManage={canManage} logos={logos} />
          </div>
        </section>
      )}
    </div>
  )
}
