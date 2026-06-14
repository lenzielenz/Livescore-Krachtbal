'use client'

import { Fragment, useState } from 'react'

import { TeamLogo } from '@/components/TeamLogo'
import type { LogoFit } from '@/lib/logo-fit'

export type RangRow = {
  teamId: number
  rank: number
  name: string
  logoUrl: string | null
  logoFit: LogoFit | null
  ringColor: string | null
  mine: boolean
  played: number
  won: number
  drawn: number
  lost: number
  forfaits: number
  goalsFor: number
  goalsAgainst: number
  points: number
  moveCls: 'up' | 'down' | 'flat'
  delta: number
  /** In de degradatie-/gevarenzone (enkel volwassen reeksen). */
  danger?: boolean
}

// Klikbare rangschikking: tik op een ploeg om de extra cijfers (doelpunten voor/tegen,
// saldo, positieverloop) uit te klappen — handig op gsm, waar die kolommen wegvallen.
// `showMove`: stijgen/dalen tonen — uit voor jeugdreeksen (daar is geen promotie/degradatie).
export function RangTable({ rows, showMove = true }: { rows: RangRow[]; showMove?: boolean }) {
  const [open, setOpen] = useState<number | null>(null)
  const hasDanger = rows.some((r) => r.danger)

  return (
    <>
    <div className="rang-scroll">
      <table className="rang-table">
        <thead>
          <tr>
            <th className="rang-rank">#</th>
            <th className="rang-teamh">Ploeg</th>
            <th title="Gespeeld">Sp</th>
            <th title="Winst">W</th>
            <th title="Gelijk">G</th>
            <th title="Verlies">V</th>
            <th title="Forfait">FF</th>
            <th className="rang-dv" title="Doelpunten voor–tegen">DV–DT</th>
            <th title="Punten">Ptn</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isOpen = open === r.teamId
            const moveArrow = r.moveCls === 'up' ? '▲' : r.moveCls === 'down' ? '▼' : '–'
            const saldo = r.goalsFor - r.goalsAgainst
            const toggle = () => setOpen((cur) => (cur === r.teamId ? null : r.teamId))
            return (
              <Fragment key={r.teamId}>
                <tr
                  className={`rang-row${r.mine ? ' rang-mine' : ''}${r.rank === 1 ? ' rang-leader' : ''}${r.rank === 2 ? ' rang-silver' : ''}${r.rank === 3 ? ' rang-bronze' : ''}${r.danger ? ' rang-danger' : ''}${isOpen ? ' open' : ''}`}
                  onClick={toggle}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggle()
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-expanded={isOpen}
                  aria-label={`${r.name} — meer cijfers`}
                >
                  <td className="rang-rank">
                    <span className="rang-pos">{r.rank === 1 && <span className="rang-crown" aria-hidden>🥇</span>}{r.rank === 2 && <span className="rang-crown" aria-hidden>🥈</span>}{r.rank === 3 && <span className="rang-crown" aria-hidden>🥉</span>}{r.danger && <span className="rang-crown" aria-hidden>🔻</span>}{r.rank}</span>
                    {showMove && (
                      <span className={`rang-move ${r.moveCls}`} title="T.o.v. vorige week">
                        {moveArrow}{r.delta !== 0 ? Math.abs(r.delta) : ''}
                      </span>
                    )}
                  </td>
                  <td className="rang-team">
                    <div className="rang-team-inner">
                      <span className="rang-logo">
                        <TeamLogo name={r.name} logoUrl={r.logoUrl} logoFit={r.logoFit} side="home" size="sm" ringColor={r.ringColor} />
                      </span>
                      <span className="rang-name">{r.name}{r.mine && <span className="rang-mybadge" title="Jouw club">★</span>}</span>
                      <span className="rang-caret" aria-hidden>{isOpen ? '▾' : '▸'}</span>
                    </div>
                  </td>
                  <td>{r.played}</td>
                  <td>{r.won}</td>
                  <td>{r.drawn}</td>
                  <td>{r.lost}</td>
                  <td>{r.forfaits}</td>
                  <td className="rang-dv rang-goals">{r.goalsFor}–{r.goalsAgainst}</td>
                  <td className="rang-pts">{r.points}</td>
                </tr>
                {isOpen && (
                  <tr className="rang-detailrow">
                    <td colSpan={9}>
                      <div className="rang-detail">
                        <span className="rang-detail-item"><b>{r.goalsFor}</b> doelpunten gemaakt</span>
                        <span className="rang-detail-item"><b>{r.goalsAgainst}</b> tegen gekregen</span>
                        <span className="rang-detail-item">saldo <b className={saldo >= 0 ? 'pos' : 'neg'}>{saldo >= 0 ? '+' : ''}{saldo}</b></span>
                        <span className="rang-detail-item">{r.played} gespeeld · {r.won}W {r.drawn}G {r.lost}V{r.forfaits ? ` · ${r.forfaits} FF` : ''}</span>
                        {showMove && r.moveCls !== 'flat' && (
                          <span className="rang-detail-item">
                            <span className={`rang-move ${r.moveCls}`}>{moveArrow}{Math.abs(r.delta)}</span> t.o.v. vorige week
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
    <p className="rang-legend">🥇 leider{hasDanger ? ' · 🔻 degradatiezone' : ''} · ★ jouw club{showMove ? ' · ▲▼ t.o.v. vorige week' : ''} · tik op een ploeg voor meer cijfers</p>
    </>
  )
}
