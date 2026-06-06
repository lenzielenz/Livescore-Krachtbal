import type { MatchStats } from '@/lib/stats'

type Player = MatchStats['players'][number]

// Automatische wedstrijdsamenvatting uit de bestaande worpdata: speler van de wedstrijd
// (hoogste score) + een paar hoogtepunten. Puur afgeleid, geen extra data nodig.
function pick(players: Player[], ok: (p: Player) => boolean, better: (a: Player, b: Player) => boolean): Player | null {
  const c = players.filter(ok)
  if (c.length === 0) return null
  return c.reduce((best, p) => (better(p, best) ? p : best))
}

const first = (name: string) => name.split(/\s+/)[0]

function Highlight({ icon, label, value, who, side }: { icon: string; label: string; value: string; who: string; side: 'home' | 'away' }) {
  return (
    <div className={`an-recap-card side-${side}`}>
      <span className="an-recap-ico" aria-hidden>{icon}</span>
      <span className="an-recap-body">
        <span className="an-recap-lbl">{label}</span>
        <span className="an-recap-val">{value}</span>
        <span className="an-recap-who">{who}</span>
      </span>
    </div>
  )
}

export function MatchRecap({ stats, teams }: { stats: MatchStats; teams: { home: string; away: string } }) {
  const active = stats.players.filter((p) => p.throws > 0)
  if (active.length === 0) return null

  const mvp = pick(
    active,
    () => true,
    (a, b) => a.score > b.score || (a.score === b.score && a.goals.points > b.goals.points) || (a.score === b.score && a.goals.points === b.goals.points && a.lost < b.lost),
  )
  const verste = pick(active, (p) => p.distance.max > 0, (a, b) => a.distance.max > b.distance.max)
  const topscorer = pick(active, (p) => p.goals.points > 0, (a, b) => a.goals.points > b.goals.points)
  const conv = pick(active, (p) => p.goalAttempts >= 3, (a, b) => a.conversion > b.conversion)
  const rug = pick(active, (p) => p.goals.rug > 0, (a, b) => a.goals.rug > b.goals.rug)

  const teamOf = (p: Player) => (p.teamSide === 'home' ? teams.home : teams.away)

  return (
    <section className="an-recap">
      <h2 className="section-title">Samenvatting</h2>
      {mvp && (
        <div className={`an-mvp side-${mvp.teamSide}`}>
          <span className="an-mvp-badge">★ Speler van de wedstrijd</span>
          <span className="an-mvp-name">#{mvp.shirtNumber} {mvp.playerName}</span>
          <span className="an-mvp-why">
            {teamOf(mvp)} · {mvp.goals.points} ptn · {mvp.goals.total} doelpunt{mvp.goals.total === 1 ? '' : 'en'}
            {mvp.goalAttempts > 0 ? ` · ${Math.round(mvp.conversion * 100)}% conversie` : ''}
          </span>
        </div>
      )}
      <div className="an-recap-cards">
        {verste && <Highlight icon="🚀" label="Verste worp" value={`${verste.distance.max.toFixed(1)} m`} who={`#${verste.shirtNumber} ${first(verste.playerName)}`} side={verste.teamSide} />}
        {topscorer && <Highlight icon="🎯" label="Topscorer" value={`${topscorer.goals.points} ptn`} who={`#${topscorer.shirtNumber} ${first(topscorer.playerName)}`} side={topscorer.teamSide} />}
        {conv && <Highlight icon="✅" label="Beste conversie" value={`${Math.round(conv.conversion * 100)}%`} who={`#${conv.shirtNumber} ${first(conv.playerName)}`} side={conv.teamSide} />}
        {rug && <Highlight icon="💪" label="Meeste rugworpen" value={`${rug.goals.rug}× (+${rug.goals.rug * 2})`} who={`#${rug.shirtNumber} ${first(rug.playerName)}`} side={rug.teamSide} />}
      </div>
    </section>
  )
}
