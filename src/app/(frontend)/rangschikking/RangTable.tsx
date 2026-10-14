'use client'

import Link from 'next/link'
import { Fragment, useLayoutEffect, useRef, useState } from 'react'

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
  /** Wiskundig kampioen — de titel kan niet meer ontnomen worden. */
  champion?: boolean
}

// Verder inkrimpen dan dit maakt de rangschikking niet meer leesbaar — daarna wint de (nog
// steeds beschikbare) interne scroll van .rang-scroll het van nog compactere rijen.
const MIN_DENSITY = 0.55

// Klikbare rangschikking: tik op een ploeg om de extra cijfers (doelpunten voor/tegen,
// saldo, positieverloop) uit te klappen — handig op gsm, waar die kolommen wegvallen.
// `showMove`: stijgen/dalen tonen — uit voor jeugdreeksen (daar is geen promotie/degradatie).
export function RangTable({ rows, showMove = true }: { rows: RangRow[]; showMove?: boolean }) {
  const [open, setOpen] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const hasDanger = rows.some((r) => r.danger)

  // De volledige rangschikking moet in één oogopslag passen, zonder te scrollen — elke reeks
  // heeft een ander aantal ploegen. Meet na elke render hoeveel ruimte er nog rest tot de
  // onderkant van het venster en verdicht de rijpadding (--rang-density) net genoeg om alles te
  // laten passen. Ver genoeg gevuld (veel ploegen) blijft de interne scroll de noodrem.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const fit = () => {
      el.style.setProperty('--rang-density', '1')
      const naturalHeight = el.scrollHeight
      const top = el.getBoundingClientRect().top + window.scrollY
      const available = window.innerHeight - top - 12
      const density =
        naturalHeight > 0 && naturalHeight > available
          ? Math.max(MIN_DENSITY, Math.min(1, available / naturalHeight))
          : 1
      el.style.setProperty('--rang-density', String(density))
    }

    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [rows.length, showMove])

  return (
    <>
    <div className="rang-scroll" ref={scrollRef}>
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
                  {/* Enkel het cijfer, altijd op exact dezelfde plek — de zone (leider/podium/
                      degradatie) zit in het kleurbalkje links van de rij, niet in het cijfer. */}
                  <td className="rang-rank">
                    <span className="rang-rankline">
                      <span className="rang-pos">{r.rank}</span>
                      {showMove && (
                        <span className={`rang-move ${r.moveCls}`} title="T.o.v. vorige week">
                          {moveArrow}{r.delta !== 0 ? Math.abs(r.delta) : ''}
                        </span>
                      )}
                    </span>
                  </td>
                  {/* Opengeklapt neemt de ploegnaam de plaats van de cijferkolommen in: op een
                      smal scherm werd een lange naam ("t Klaverken Bugge…") anders afgekapt, net
                      wanneer je de ploeg aantikte om ze te bekijken. De cijfers staan dan toch
                      in de detailrij eronder. 7 = ploeg + Sp, W, G, V, FF en DV–DT. */}
                  <td className="rang-team" colSpan={isOpen ? 7 : undefined}>
                    <div className="rang-team-inner">
                      <span className="rang-logo">
                        <TeamLogo name={r.name} logoUrl={r.logoUrl} logoFit={r.logoFit} side="home" size="sm" ringColor={r.ringColor} />
                      </span>
                      <span className="rang-name">{r.name}{r.champion && <span className="rang-champ" title="Wiskundig kampioen" aria-label="Wiskundig kampioen"> 🏆</span>}</span>
                      <span className="rang-caret" aria-hidden>{isOpen ? '▾' : '▸'}</span>
                    </div>
                  </td>
                  {!isOpen && (
                    <>
                      <td>{r.played}</td>
                      <td>{r.won}</td>
                      <td>{r.drawn}</td>
                      <td>{r.lost}</td>
                      <td>{r.forfaits}</td>
                      <td className="rang-dv rang-goals">{r.goalsFor}–{r.goalsAgainst}</td>
                    </>
                  )}
                  <td className="rang-pts"><span className="rang-pts-chip">{r.points}</span></td>
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
                        <Link href={`/ploegen/${r.teamId}`} className="rang-detail-link" onClick={(e) => e.stopPropagation()}>
                          Wedstrijdhistoriek &amp; volgende wedstrijden →
                        </Link>
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
    <p className="rang-legend">
      <i className="rang-key goud" aria-hidden /> leider
      {hasDanger && <> · <i className="rang-key rood" aria-hidden /> degradatiezone</>}
      {showMove ? ' · ▲▼ t.o.v. vorige week' : ''} · tik op een ploeg voor meer cijfers
    </p>
    </>
  )
}
