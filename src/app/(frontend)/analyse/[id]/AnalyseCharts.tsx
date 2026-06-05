import type { MatchStats } from '@/lib/stats'

// Per-speler staafgrafieken (server-gerenderd, pure CSS-balken in de ploegkleuren).
type Row = { id: number; label: string; side: 'home' | 'away'; value: number; display: string }

function BarChart({ title, rows, hint }: { title: string; rows: Row[]; hint?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  const ordered = [...rows].sort((a, b) => b.value - a.value)
  return (
    <div className="an-chart">
      <h3 className="an-chart-title">{title}{hint && <span className="an-chart-hint"> {hint}</span>}</h3>
      <div className="an-bars">
        {ordered.map((r) => (
          <div key={r.id} className={`an-bar-row side-${r.side}`}>
            <span className="an-bar-lbl">{r.label}</span>
            <span className="an-bar-track">
              <span className="an-bar-fill" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
            </span>
            <span className="an-bar-val">{r.display}</span>
          </div>
        ))}
        {ordered.length === 0 && <p className="empty">Geen data.</p>}
      </div>
    </div>
  )
}

export function AnalyseCharts({ stats, teams }: { stats: MatchStats; teams: { home: string; away: string } }) {
  const players = stats.players
  const row = (value: number, display: string) => (p: (typeof players)[number]): Row => ({
    id: p.playerId,
    label: `#${p.shirtNumber} ${p.playerName.split(/\s+/)[0]}`,
    side: p.teamSide,
    value,
    display,
  })

  const points = players.map((p) => row(p.goals.points, `${p.goals.points}`)(p))
  const throwsR = players.map((p) => row(p.throws, `${p.throws}`)(p))
  const conv = players.map((p) => row(Math.round(p.conversion * 100), `${Math.round(p.conversion * 100)}%`)(p))
  const dist = players.map((p) => row(p.distance.avg, `${p.distance.avg.toFixed(1)} m`)(p))

  return (
    <section className="an-charts">
      <div className="an-charts-legend">
        <span className="side-home">● {teams.home}</span>
        <span className="side-away">● {teams.away}</span>
      </div>
      <div className="an-charts-grid">
        <BarChart title="Punten per speler" rows={points} />
        <BarChart title="Worpen per speler" rows={throwsR} />
        <BarChart title="Conversie" rows={conv} hint="(doelpunten / doelpogingen)" />
        <BarChart title="Gemiddelde worpafstand" rows={dist} />
      </div>
    </section>
  )
}
