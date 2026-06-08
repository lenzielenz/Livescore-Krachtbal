import type { MatchStats } from '@/lib/stats'
import './match-scorers.css'

// Doelpuntenmakers na afloop: per ploeg iedereen die scoorde, met punten en doelpunt-"pips"
// (gewone doelpunten als stip, rugworpen als gouden ster). Puur afgeleid uit de worpdata.

type Player = MatchStats['players'][number]

function Pips({ nek, rug }: { nek: number; rug: number }) {
  return (
    <span className="msc-pips" aria-hidden>
      {Array.from({ length: nek }).map((_, i) => (
        <span key={`n${i}`} className="msc-pip nek" />
      ))}
      {Array.from({ length: rug }).map((_, i) => (
        <span key={`r${i}`} className="msc-pip rug">★</span>
      ))}
    </span>
  )
}

export function MatchScorers({
  players,
  teams,
  colors,
}: {
  players: Player[]
  teams: { home: string; away: string }
  colors: { home: string | null; away: string | null }
}) {
  const scorers = players.filter((p) => p.goals.total > 0)
  if (scorers.length === 0) return null

  const Column = ({ side }: { side: 'home' | 'away' }) => {
    const list = scorers
      .filter((p) => p.teamSide === side)
      .sort((a, b) => b.goals.points - a.goals.points || b.goals.total - a.goals.total)
    const color = (side === 'home' ? colors.home : colors.away) ?? undefined
    return (
      <div className="msc-col">
        <div className="msc-team" style={{ color, borderColor: color }}>
          {teams[side]}
        </div>
        {list.length === 0 ? (
          <p className="msc-none">Geen doelpunten</p>
        ) : (
          list.map((p) => (
            <div className="msc-row" key={p.playerId}>
              <span className="msc-num" style={{ color }}>#{p.shirtNumber}</span>
              <span className="msc-name">{p.playerName}</span>
              <Pips nek={p.goals.nek} rug={p.goals.rug} />
              <span className="msc-pts">
                {p.goals.points}<span className="msc-pts-u">ptn</span>
              </span>
            </div>
          ))
        )}
      </div>
    )
  }

  return (
    <section className="msc">
      <h2 className="section-title">⚡ Doelpuntenmakers</h2>
      <div className="msc-grid">
        <Column side="home" />
        <Column side="away" />
      </div>
      <p className="msc-legend">
        <span className="msc-pip nek" /> doelpunt (+1) &nbsp;·&nbsp; <span className="msc-pip rug">★</span> rugworp (+2)
      </p>
    </section>
  )
}
