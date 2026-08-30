'use client'

import { useMemo, useState } from 'react'

import { MatchStats } from '@/components/MatchStats'
import type { ShotPoint } from '@/lib/match-engine'
import { detectMatchPatterns } from '@/lib/match-patterns'
import type { MatchStats as Stats } from '@/lib/stats'
import { AnalyseCharts } from './AnalyseCharts'
import { MatchRecap } from './MatchRecap'
import { MomentumChart } from './MomentumChart'

type Goal = { side: 'home' | 'away'; points: number; half: number; gameClock?: number }
type Timeout = { side: 'home' | 'away'; half: number; gameClock: number }
type Player = Stats['players'][number]

/** Verdedigende cijfers per speler (vangsten + tikken), zie buildDefenseStats. */
export type DefenseCijfers = { playerId: number; catches: number; taps: number }

/** Fysieke meting uit de videotracking (cv/fysiek.py, geüpload via de CV-brug). */
export type FysiekSpeler = {
  team: 'thuis' | 'uit'
  rugnummer: number
  naam?: string
  afstand_m: number
  sprints: number
  topsnelheid_m_s: number
  actieve_s: number
}

const first = (n: string) => n.split(/\s+/)[0]

// Compacte spelerfocus: de kerncijfers van één speler, in dezelfde kaartstijl als de samenvatting.
// Alles op één kaart: worpen, doelpunten, vangsten — en als er videotracking is, ook het fysieke
// luik (gelopen afstand, sprintjes, topsnelheid).
function PlayerFocus({ p, team, defense, fysiek }: { p: Player; team: string; defense?: DefenseCijfers; fysiek?: FysiekSpeler }) {
  const cards: { icon: string; label: string; value: string }[] = [
    { icon: '🎯', label: 'Punten', value: `${p.goals.points}` },
    { icon: '🥅', label: 'Doelpunten', value: `${p.goals.total} (${p.goals.nek}/${p.goals.rug})` },
    { icon: '✅', label: 'Conversie', value: p.goalAttempts > 0 ? `${Math.round(p.conversion * 100)}%` : '—' },
    { icon: '🚀', label: 'Verste worp', value: p.distance.max > 0 ? `${p.distance.max.toFixed(1)} m` : '—' },
    { icon: '🏐', label: 'Worpen', value: `${p.throws} (${p.byType.nek}/${p.byType.rug})` },
    { icon: '⚠️', label: 'Geforceerd', value: `${p.lost} (${p.caught}g/${p.out}b)` },
  ]
  if (defense && defense.catches + defense.taps > 0) {
    cards.push({ icon: '🧤', label: 'Vangsten', value: `${defense.catches}${defense.taps > 0 ? ` (+${defense.taps} tikken)` : ''}` })
  }
  if (fysiek) {
    cards.push(
      { icon: '🏃', label: 'Gelopen', value: fysiek.afstand_m >= 1000 ? `${(fysiek.afstand_m / 1000).toFixed(2)} km` : `${Math.round(fysiek.afstand_m)} m` },
      { icon: '⚡', label: 'Sprintjes', value: `${fysiek.sprints}` },
      { icon: '💨', label: 'Topsnelheid', value: `${(fysiek.topsnelheid_m_s * 3.6).toFixed(1)} km/u` },
    )
  }
  return (
    <section className="an-recap">
      <div className={`an-mvp side-${p.teamSide}`}>
        <span className="an-mvp-badge">Spelerfocus</span>
        <span className="an-mvp-name">#{p.shirtNumber} {p.playerName}</span>
        <span className="an-mvp-why">{team} · score {p.score > 0 ? `+${p.score}` : p.score}</span>
      </div>
      <div className="an-recap-cards">
        {cards.map((c) => (
          <div key={c.label} className={`an-recap-card side-${p.teamSide}`}>
            <span className="an-recap-ico" aria-hidden>{c.icon}</span>
            <span className="an-recap-body">
              <span className="an-recap-lbl">{c.label}</span>
              <span className="an-recap-val">{c.value}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

// Detail-analyse met een snelwissel-balk: bekijk alles voor de héle wedstrijd, of focus
// razendsnel op één speler (de kaarten en het veld scopen mee).
export function AnalyseDetailView({
  stats,
  shots,
  teams,
  goalAreaDepth,
  speelveldM,
  momentumGoals,
  momentumTimeouts = [],
  teamColors,
  matchLabel,
  defense = [],
  fysiek = [],
}: {
  stats: Stats
  shots: ShotPoint[]
  teams: { home: string; away: string }
  goalAreaDepth: number
  /** Echte speelveldlengte (m); leeg = reglementair 26 m. */
  speelveldM?: number | null
  momentumGoals: Goal[]
  momentumTimeouts?: Timeout[]
  teamColors?: { home: string | null; away: string | null }
  /** Wedstrijd-omschrijving (reeks · datum) voor de gedownloade video. */
  matchLabel?: string
  /** Vangsten/tikken per speler (buildDefenseStats) — voor de spelerskaart. */
  defense?: DefenseCijfers[]
  /** Fysieke stats uit de videotracking (cvFysiek op de wedstrijd) — voor de spelerskaart. */
  fysiek?: FysiekSpeler[]
}) {
  const players = stats.players
  const [scope, setScope] = useState<'match' | number>('match')
  const focus = typeof scope === 'number' ? players.find((p) => p.playerId === scope) ?? null : null
  // Fysiek is gemeten op team + rugnummer (de tracker kent geen speler-id's) — koppel op shirtNumber.
  const fysiekVan = (p: Player) =>
    fysiek.find((f) => f.rugnummer === p.shirtNumber && (f.team === 'thuis') === (p.teamSide === 'home'))
  const defenseVan = (p: Player) => defense.find((d) => d.playerId === p.playerId)
  // Terugkerende "zelfde speler / zelfde worp"-patronen — om de naam prominent aanklikbaar te maken.
  const patterns = useMemo(() => detectMatchPatterns(stats), [stats])

  return (
    <>
      {players.length > 0 && (
        <div className="an-switch" role="tablist" aria-label="Wissel tussen wedstrijd en speler">
          <button type="button" className={`an-switch-btn${scope === 'match' ? ' on' : ''}`} onClick={() => setScope('match')}>
            🏟️ Hele wedstrijd
          </button>
          {players.map((p) => (
            <button
              key={p.playerId}
              type="button"
              className={`an-switch-btn side-${p.teamSide}${scope === p.playerId ? ' on' : ''}`}
              onClick={() => setScope(p.playerId)}
            >
              #{p.shirtNumber} {first(p.playerName)}
            </button>
          ))}
        </div>
      )}

      {/* Opvallende patronen: klik de naam om meteen naar die spelerfocus te springen. */}
      {scope === 'match' && patterns.length > 0 && (
        <section className="an-patterns">
          <h2 className="an-sub">
            🔁 Opvallende patronen <span className="an-chart-hint">klik een naam om die speler te bekijken</span>
          </h2>
          <div className="an-pat-grid">
            {patterns.map((p) => (
              <button
                key={`${p.playerId}-${p.kind}`}
                type="button"
                className={`an-pat side-${p.teamSide}`}
                onClick={() => setScope(p.playerId)}
                aria-label={`Bekijk #${p.shirtNumber} ${p.playerName} — ${p.label}`}
              >
                <span className="an-pat-ico" aria-hidden>{p.icon}</span>
                <span className="an-pat-body">
                  <span className="an-pat-label">{p.label}</span>
                  <span className="an-pat-name">#{p.shirtNumber} {p.playerName}</span>
                  <span className="an-pat-detail">{p.detail}</span>
                </span>
                <span className="an-pat-cta" aria-hidden>bekijken →</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {momentumGoals.length > 0 && <MomentumChart goals={momentumGoals} timeouts={momentumTimeouts} teams={teams} colors={teamColors} />}

      {players.length === 0 ? (
        <p className="empty">Deze wedstrijd heeft geen gedetailleerde worpdata (in snelscoremodus gespeeld).</p>
      ) : focus ? (
        <>
          <PlayerFocus p={focus} team={focus.teamSide === 'home' ? teams.home : teams.away} defense={defenseVan(focus)} fysiek={fysiekVan(focus)} />
          {/* hideShotmap: de grote veldkaart bovenaan de pagina toont het veld al (met dezelfde
              spelerfilter) — hier nog eens een veld zou dubbel zijn. */}
          <MatchStats key={`p${focus.playerId}`} stats={stats} shots={shots} teams={teams} goalAreaDepth={goalAreaDepth} speelveldM={speelveldM ?? undefined} focusPlayerId={focus.playerId} matchLabel={matchLabel} hideShotmap />
        </>
      ) : (
        <>
          <MatchRecap stats={stats} teams={teams} />
          {/* Fysiek uit de videotracking: wie liep het meest, wie sprintte het vaakst. Klik door
              naar de spelerfocus waar deze cijfers naast de worpstatistieken staan. */}
          {fysiek.length > 0 && (
            <section className="an-patterns">
              <h2 className="an-sub">
                🏃 Fysiek uit de video <span className="an-chart-hint">gelopen afstand · sprintjes · topsnelheid</span>
              </h2>
              <div className="an-pat-grid">
                {fysiek
                  .slice()
                  .sort((a, b) => b.afstand_m - a.afstand_m)
                  .map((f) => {
                    const side = f.team === 'thuis' ? 'home' : 'away'
                    const speler = players.find((p) => p.shirtNumber === f.rugnummer && p.teamSide === side)
                    // Zonder speler klopt de spoortoewijzing niet met de opstelling: zeg dat, in
                    // plaats van de ploegnaam als spelersnaam te tonen (dat leest als een speler).
                    const naam = f.naam ?? speler?.playerName ?? 'niet in de opstelling'
                    const ploeg = f.team === 'thuis' ? teams.home : teams.away
                    const meters = f.afstand_m >= 1000 ? `${(f.afstand_m / 1000).toFixed(2)} km` : `${Math.round(f.afstand_m)} m`
                    const detail = `${meters} · ${f.sprints} sprintjes · top ${(f.topsnelheid_m_s * 3.6).toFixed(1)} km/u${speler ? '' : ` · ${ploeg}`}`
                    return (
                      <button
                        key={`${f.team}-${f.rugnummer}`}
                        type="button"
                        className={`an-pat side-${side}`}
                        onClick={() => speler && setScope(speler.playerId)}
                        disabled={!speler}
                        aria-label={`#${f.rugnummer} ${naam} — ${detail}`}
                      >
                        <span className="an-pat-ico" aria-hidden>🏃</span>
                        <span className="an-pat-body">
                          <span className="an-pat-name">#{f.rugnummer} {naam}</span>
                          <span className="an-pat-detail">{detail}</span>
                        </span>
                        {speler && <span className="an-pat-cta" aria-hidden>bekijken →</span>}
                      </button>
                    )
                  })}
              </div>
            </section>
          )}
          <AnalyseCharts stats={stats} teams={teams} />
          <MatchStats key="match" stats={stats} shots={shots} teams={teams} goalAreaDepth={goalAreaDepth} speelveldM={speelveldM ?? undefined} matchLabel={matchLabel} hideShotmap />
        </>
      )}
    </>
  )
}
