'use client'

import { useRef, useState } from 'react'

import { ErrorCatch } from '@/components/ErrorCatch'
import { FieldSchema, type FieldMarker } from '@/components/FieldSchema'
import { FlowReplay } from '@/components/FlowReplay'
import { saveOrShareBlob, slugFilename, svgToPngBlob } from '@/lib/client-download'
import type { ShotPoint } from '@/lib/match-engine'
import type { MatchStats as Stats } from '@/lib/stats'
import './match-stats.css'

const OUTCOME_COLOR: Record<string, string> = {
  goal: '#06d6a0',
  caught: '#4cc9f0',
  out_side: '#ef476f',
  out_back: '#f78c6b',
  in_field: '#8fb3a1',
}

function CompareBar({ label, home, away, fmt }: { label: string; home: number; away: number; fmt?: (n: number) => string }) {
  const total = home + away
  const hPct = total ? (home / total) * 100 : 50
  const f = fmt ?? ((n: number) => String(n))
  return (
    <div className="cmp-row">
      <span className="cmp-val">{f(home)}</span>
      <div className="cmp-bar">
        <div className="cmp-bar-home" style={{ width: `${hPct}%` }} />
        <div className="cmp-bar-away" style={{ width: `${100 - hPct}%` }} />
      </div>
      <span className="cmp-val">{f(away)}</span>
      <span className="cmp-label">{label}</span>
    </div>
  )
}

export function MatchStats({
  stats,
  shots,
  teams,
  goalAreaDepth = 10,
  speelveldM,
  focusPlayerId,
  matchLabel,
  hideShotmap = false,
}: {
  stats: Stats
  shots: ShotPoint[]
  teams: { home: string; away: string }
  goalAreaDepth?: number
  /** Echte speelveldlengte (m); leeg = reglementair 26 m. */
  speelveldM?: number
  /** Start gefilterd op één speler (gezet via de snelwissel-balk bovenaan). */
  focusPlayerId?: number
  /** Wedstrijd-omschrijving (reeks · datum) voor de gedownloade video. */
  matchLabel?: string
  /** Verberg het veld met de worpenkaart — voor pagina's die al een (grotere) veldkaart tonen. */
  hideShotmap?: boolean
}) {
  const [playerFilter, setPlayerFilter] = useState<number | 'all'>(focusPlayerId ?? 'all')
  const [goalsOnly, setGoalsOnly] = useState(false)
  const [view, setView] = useState<'dots' | 'flow' | 'heat' | 'video'>('dots')
  const [orderFilter, setOrderFilter] = useState<'all' | 'first' | 'second' | 'last'>('all')
  const [playerView, setPlayerView] = useState<'table' | 'cards'>('table')
  // Veldweergave (Punten/Flow/Heatmap) als afbeelding downloaden i.p.v. een screenshot.
  const fieldWrapRef = useRef<HTMLDivElement>(null)
  const [imgBusy, setImgBusy] = useState(false)

  const downloadField = async () => {
    const svg = fieldWrapRef.current?.querySelector('svg')
    if (!svg || imgBusy) return
    setImgBusy(true)
    try {
      // Hoge resolutie (ook voor de heatmap): schaal 6 is scherp genoeg voor inzoomen/afdrukken.
      const blob = await svgToPngBlob(svg as SVGSVGElement, { scale: 6, background: '#0b1c14' })
      const viewName = view === 'flow' ? 'flow' : view === 'heat' ? 'heatmap' : 'punten'
      const name = slugFilename('krachtbal', viewName, teams.home, 'vs', teams.away, matchLabel) + '.png'
      await saveOrShareBlob(blob, name, matchLabel ?? 'Krachtbal')
    } catch {
      // stil: gebruiker kan opnieuw proberen
    } finally {
      setImgBusy(false)
    }
  }

  const matchesOrder = (s: ShotPoint) =>
    orderFilter === 'all' ||
    (orderFilter === 'first' && s.throwNumber === 1) ||
    (orderFilter === 'second' && s.throwNumber === 2) ||
    (orderFilter === 'last' && s.isLastThrow)

  const filteredShots = shots.filter(
    (s) =>
      (playerFilter === 'all' || s.playerId === playerFilter) &&
      (!goalsOnly || s.outcome === 'goal') &&
      matchesOrder(s),
  )
  // 'flow' = de baan van de bal als lijn op het veld (vertrekpunt → landing, met het
  // worpnummer als stap 1/2/3). 'dots' toont enkel de landingspunten.
  const isFlow = view === 'flow'
  const markers: FieldMarker[] = filteredShots.map((s) => ({
    x: s.x,
    y: s.y,
    ...(isFlow ? { fromX: s.fromX, fromY: s.fromY } : {}),
    color: OUTCOME_COLOR[s.outcome] ?? '#ffd166',
    r: s.outcome === 'goal' ? 8 : 6,
    label: String(s.throwNumber),
  }))
  const heatPoints = filteredShots.map((s) => ({ x: s.x, y: s.y }))

  return (
    <div className="stats">
      <h2 className="section-title">Statistieken</h2>

      <div className="cmp">
        <div className="cmp-head">
          <span>{teams.home}</span>
          <span>{teams.away}</span>
        </div>
        <CompareBar label="Worpen" home={stats.teams.home.throws} away={stats.teams.away.throws} />
        <CompareBar label="Doelpunten" home={stats.teams.home.goals} away={stats.teams.away.goals} />
        <CompareBar label="Punten" home={stats.teams.home.points} away={stats.teams.away.points} />
        <CompareBar label="Gem. afstand (m)" home={stats.teams.home.avgDistance} away={stats.teams.away.avgDistance} fmt={(n) => n.toFixed(1)} />
        <CompareBar label="Max afstand (m)" home={stats.teams.home.maxDistance} away={stats.teams.away.maxDistance} fmt={(n) => n.toFixed(1)} />
      </div>

      <div className={hideShotmap ? undefined : 'stats-grid'}>
        {!hideShotmap && (
        <div className="shotmap">
          <div className="shotmap-controls">
            <button type="button" className={view === 'dots' ? 'on' : ''} onClick={() => setView('dots')}>Punten</button>
            <button type="button" className={view === 'flow' ? 'on' : ''} onClick={() => setView('flow')}>Flow</button>
            <button type="button" className={view === 'video' ? 'on' : ''} onClick={() => setView('video')}>🎬 Video</button>
            <button type="button" className={view === 'heat' ? 'on' : ''} onClick={() => setView('heat')}>Heatmap</button>
          </div>
          {view !== 'heat' && view !== 'video' && (
            <>
              <div className="shotmap-controls">
                <button type="button" className={!goalsOnly ? 'on' : ''} onClick={() => setGoalsOnly(false)}>Alle worpen</button>
                <button type="button" className={goalsOnly ? 'on' : ''} onClick={() => setGoalsOnly(true)}>Enkel doelpunten</button>
              </div>
              <div className="shotmap-controls">
                <button type="button" className={orderFilter === 'all' ? 'on' : ''} onClick={() => setOrderFilter('all')}>Alle</button>
                <button type="button" className={orderFilter === 'first' ? 'on' : ''} onClick={() => setOrderFilter('first')}>1e worp</button>
                <button type="button" className={orderFilter === 'second' ? 'on' : ''} onClick={() => setOrderFilter('second')}>2e worp</button>
                <button type="button" className={orderFilter === 'last' ? 'on' : ''} onClick={() => setOrderFilter('last')}>Laatste</button>
              </div>
            </>
          )}
          {view === 'video' ? (
            // De "video": speelt de hele wedstrijd chronologisch af (filters niet van toepassing).
            // In een error-boundary zodat een hapering hier niet de hele analysepagina platlegt.
            <ErrorCatch
              label="De video-replay"
              fallback={(err) => (
                <p className="empty">
                  De video-replay kon niet laden. Probeer de andere weergaven (Punten/Flow/Heatmap).
                  {err.message && (
                    <>
                      <br />
                      <small style={{ opacity: 0.7 }}>{err.message}</small>
                    </>
                  )}
                </p>
              )}
            >
              <FlowReplay shots={shots} teams={teams} goalAreaDepth={goalAreaDepth} speelveldM={speelveldM} matchLabel={matchLabel} />
            </ErrorCatch>
          ) : (
            <>
              <div ref={fieldWrapRef}>
                <FieldSchema
                  className="shotmap-field"
                  markers={view === 'heat' ? [] : markers}
                  heatPoints={view === 'heat' ? heatPoints : undefined}
                  goalAreaDepthM={goalAreaDepth}
                  speelveldM={speelveldM}
                />
              </div>
              <div className="shotmap-controls">
                <button type="button" className="replay-dl" onClick={downloadField} disabled={imgBusy}>
                  {imgBusy ? '⏳ Bezig…' : '⬇ Download afbeelding'}
                </button>
              </div>
              {view !== 'heat' ? (
                <div className="shotmap-legend">
                  <span><i style={{ background: OUTCOME_COLOR.goal }} /> doelpunt</span>
                  <span><i style={{ background: OUTCOME_COLOR.caught }} /> gevangen</span>
                  <span><i style={{ background: OUTCOME_COLOR.out_side }} /> buiten</span>
                  <span><i style={{ background: OUTCOME_COLOR.in_field }} /> in veld</span>
                  <span className="shotmap-note">{isFlow ? 'lijn = baan van de bal · cijfer = stap (1→2→3)' : 'cijfer = worpnummer'}</span>
                </div>
              ) : (
                <div className="shotmap-legend">
                  <span className="heat-scale" /> <span>weinig → veel worpen</span>
                  <span className="shotmap-note">{filteredShots.length} worpen</span>
                </div>
              )}
            </>
          )}
        </div>
        )}

        <div className="player-table-wrap">
          <div className="pt-filter">
            <button className={playerFilter === 'all' ? 'on' : ''} onClick={() => setPlayerFilter('all')}>Alle spelers</button>
            {stats.players.map((p) => (
              <button key={p.playerId} className={playerFilter === p.playerId ? 'on' : ''} onClick={() => setPlayerFilter(p.playerId)}>
                #{p.shirtNumber} {p.playerName.split(/\s+/)[0]}
              </button>
            ))}
          </div>

          <div className="pt-viewtoggle">
            <button type="button" className={playerView === 'table' ? 'on' : ''} onClick={() => setPlayerView('table')}>Tabel</button>
            <button type="button" className={playerView === 'cards' ? 'on' : ''} onClick={() => setPlayerView('cards')}>Kaarten</button>
          </div>

          {playerView === 'table' ? (
            <table className="player-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Speler</th>
                  <th title="Worpen">W</th>
                  <th title="Worpen per soort: nek / rug">N/R</th>
                  <th title="Doelpunten (nek/rug)">D</th>
                  <th title="Richting links/midden/rechts">L/M/R</th>
                  <th title="Doelpogingen — raak / gegaan voor goal">Doel</th>
                  <th title="Conversie = doelpunten / doelpogingen">Conv</th>
                  <th title="Geforceerd / balverlies (gevangen + buiten)">Gefor.</th>
                  <th title="Score = punten − geforceerd (gevangen én buiten tellen negatief)">Sco</th>
                </tr>
              </thead>
              <tbody>
                {stats.players.length === 0 && (
                  <tr><td colSpan={10} className="empty">Nog geen worpen geregistreerd.</td></tr>
                )}
                {stats.players.map((p) => (
                  <tr key={p.playerId} className={`side-${p.teamSide}`}>
                    <td>{p.shirtNumber}</td>
                    <td>{p.playerName}</td>
                    <td>{p.throws}</td>
                    <td>{p.byType.nek}/{p.byType.rug}</td>
                    <td>{p.goals.total} ({p.goals.nek}/{p.goals.rug})</td>
                    <td>{p.zones.links}/{p.zones.midden}/{p.zones.rechts}</td>
                    <td>{p.goals.total}/{p.goalAttempts}</td>
                    <td>{Math.round(p.conversion * 100)}%</td>
                    <td className={p.lost > 0 ? 'neg' : undefined}>{p.lost} <span className="pt-sub">({p.caught}g/{p.out}b)</span></td>
                    <td className={p.score < 0 ? 'neg' : undefined}>{p.score > 0 ? `+${p.score}` : p.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="pl-cards">
              {stats.players.length === 0 && <p className="empty">Nog geen worpen geregistreerd.</p>}
              {stats.players
                .filter((p) => playerFilter === 'all' || p.playerId === playerFilter)
                .map((p) => {
                const pShots = shots.filter((s) => s.playerId === p.playerId)
                const pMarkers: FieldMarker[] = pShots.map((s) => ({
                  x: s.x,
                  y: s.y,
                  fromX: s.fromX,
                  fromY: s.fromY,
                  color: OUTCOME_COLOR[s.outcome] ?? '#ffd166',
                  r: s.outcome === 'goal' ? 7 : 5,
                }))
                const zoneTot = p.zones.links + p.zones.midden + p.zones.rechts || 1
                return (
                  <div key={p.playerId} className={`pl-card side-${p.teamSide}`}>
                    <div className="pl-card-head">
                      <span className="pl-num">{p.shirtNumber}</span>
                      <span className="pl-name">{p.playerName}</span>
                      <span className={`pl-score ${p.score < 0 ? 'neg' : ''}`}>{p.score > 0 ? `+${p.score}` : p.score}</span>
                    </div>
                    <div className="pl-card-body">
                      <FieldSchema className="pl-map" markers={pMarkers} goalAreaDepthM={goalAreaDepth} speelveldM={speelveldM} />
                      <div className="pl-metrics">
                        <div className="pl-metric">
                          <span className="pl-lbl">Doelpogingen</span>
                          <span className="pl-val">{p.goals.total}/{p.goalAttempts} <em>({Math.round(p.conversion * 100)}%)</em></span>
                        </div>
                        <div className="pl-metric">
                          <span className="pl-lbl">Richting</span>
                          <span className="pl-bar">
                            <i className="seg l" style={{ width: `${(p.zones.links / zoneTot) * 100}%` }} />
                            <i className="seg m" style={{ width: `${(p.zones.midden / zoneTot) * 100}%` }} />
                            <i className="seg r" style={{ width: `${(p.zones.rechts / zoneTot) * 100}%` }} />
                          </span>
                          <span className="pl-val">{p.zones.links}/{p.zones.midden}/{p.zones.rechts}</span>
                        </div>
                        <div className="pl-metric">
                          <span className="pl-lbl">Nek / Rug (worpen)</span>
                          <span className="pl-val">{p.byType.nek} / {p.byType.rug} <em>({p.goals.nek}/{p.goals.rug} goal)</em></span>
                        </div>
                        <div className="pl-metric">
                          <span className="pl-lbl">Geforceerd</span>
                          <span className={`pl-val ${p.lost > 0 ? 'neg' : ''}`}>{p.lost} <em>({p.caught} gevangen, {p.out} buiten)</em></span>
                        </div>
                        <div className="pl-metric">
                          <span className="pl-lbl">Worpen · afstand</span>
                          <span className="pl-val">{p.throws} · {p.distance.avg.toFixed(1)}m</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
