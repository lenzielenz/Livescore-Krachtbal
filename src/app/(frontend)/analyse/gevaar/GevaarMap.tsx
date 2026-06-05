'use client'

import { useState } from 'react'

import { FieldSchema, type ConvPoint, type FieldMarker } from '@/components/FieldSchema'
import type { Point } from '@/lib/field'
import type { DangerShot } from '@/lib/player-danger'

// Twee verschillende beelden van een speler:
//  • Gevaarzone — van waar is hij aanvallend het gevaarlijkst (conversie per zone);
//  • Doelpunten — waar hij het meeste scoort (volume/dichtheid van zijn doelpunten);
// plus Pogingen (losse worpen: groen = doelpunt, rood = gemist).
export function GevaarMap({ shots }: { shots: DangerShot[] }) {
  const [view, setView] = useState<'danger' | 'scores' | 'dots'>('danger')

  const convPoints: ConvPoint[] = shots.map((s) => ({ x: s.x, y: s.y, goal: s.goal }))
  const goalPoints: Point[] = shots.filter((s) => s.goal).map((s) => ({ x: s.x, y: s.y }))
  const markers: FieldMarker[] = shots.map((s) => ({
    x: s.x,
    y: s.y,
    color: s.goal ? '#06d6a0' : '#ef476f',
    r: s.goal ? 4.5 : 3,
  }))

  return (
    <div className="gev-map">
      <div className="gev-controls">
        <button type="button" className={view === 'danger' ? 'on' : ''} onClick={() => setView('danger')}>Gevaarzone</button>
        <button type="button" className={view === 'scores' ? 'on' : ''} onClick={() => setView('scores')}>Doelpunten</button>
        <button type="button" className={view === 'dots' ? 'on' : ''} onClick={() => setView('dots')}>Pogingen</button>
      </div>
      <FieldSchema
        className="gev-field"
        half="bottom"
        convMinAttempts={1}
        convPoints={view === 'danger' ? convPoints : undefined}
        heatPoints={view === 'scores' ? goalPoints : undefined}
        markers={view === 'dots' ? markers : []}
        ends={{ bottom: { text: '▼ Doel', color: '#06d6a0' } }}
      />
      {view === 'danger' ? (
        <div className="gev-legend">
          <span className="gev-scale" /> <span>weinig kans → gevaarlijk (scoringskans)</span>
          <span className="gev-note">van waar hij aanvallend het gevaarlijkst is · {shots.length} pogingen</span>
        </div>
      ) : view === 'scores' ? (
        <div className="gev-legend">
          <span className="gev-scale" /> <span>weinig → veel doelpunten</span>
          <span className="gev-note">van waar hij het meeste scoort · {goalPoints.length} doelpunten</span>
        </div>
      ) : (
        <div className="gev-legend">
          <span><i style={{ background: '#06d6a0' }} /> doelpunt</span>
          <span><i style={{ background: '#ef476f' }} /> gemist</span>
          <span className="gev-note">vertrekpunt van de worp</span>
        </div>
      )}
    </div>
  )
}
