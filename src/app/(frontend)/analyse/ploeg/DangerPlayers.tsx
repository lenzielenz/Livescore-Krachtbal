import { FieldSchema, type FieldMarker } from '@/components/FieldSchema'
import type { FlowShot } from '@/lib/player-danger'

// Gevaarspelers in beeld: per topscorer een mini-veld dat toont van waar hij scoort (traject +
// landingsplek, rugworp in goud). Zo zie je meteen wie te stoppen en uit welke hoek.
const C_GOAL = '#06d6a0'
const C_RUG = '#ffd166'

type TopPlayer = { playerId: number; name: string; shirtNumber: number; goals: number; points: number }

export function DangerPlayers({ flowShots, players, max = 3 }: { flowShots: FlowShot[]; players: TopPlayer[]; max?: number }) {
  const tops = [...players]
    .filter((p) => p.goals > 0)
    .sort((a, b) => b.goals - a.goals || b.points - a.points)
    .slice(0, max)
    .map((p) => ({ ...p, shots: flowShots.filter((s) => s.playerId === p.playerId && s.goal) }))
    .filter((p) => p.shots.length > 0)

  if (tops.length === 0) return null

  return (
    <div className="dp-grid">
      {tops.map((p) => {
        const markers: FieldMarker[] = p.shots.map((s) => ({
          x: s.landX,
          y: s.landY,
          fromX: s.x,
          fromY: s.y,
          color: s.type === 'rug' ? C_RUG : C_GOAL,
          r: 4,
        }))
        const rug = p.shots.filter((s) => s.type === 'rug').length
        return (
          <div className="dp-card" key={p.playerId}>
            <div className="dp-head">
              <span className="dp-num">#{p.shirtNumber}</span>
              <span className="dp-name">{p.name}</span>
              <span className="dp-stat">
                {p.goals} doelpunt{p.goals === 1 ? '' : 'en'}{rug ? ` · ${rug} rug` : ''}
              </span>
            </div>
            <FieldSchema className="dp-field" half="bottom" markers={markers} ends={{ bottom: { text: '▼ Doel', color: C_GOAL } }} />
          </div>
        )
      })}
    </div>
  )
}
