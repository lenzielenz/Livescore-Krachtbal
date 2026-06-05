'use client'

import { useState } from 'react'

import { FieldSchema, type FieldMarker, type ConvPoint } from '@/components/FieldSchema'
import type { DangerShot } from '@/lib/player-danger'

// Gevaarzone-visualisatie: schakel tussen de conversie-heatmap (waar is hij gevaarlijk)
// en losse doelpogingen (groen = doelpunt, rood = gemist).
export function GevaarMap({ shots }: { shots: DangerShot[] }) {
  const [view, setView] = useState<'heat' | 'dots'>('heat')

  const convPoints: ConvPoint[] = shots.map((s) => ({ x: s.x, y: s.y, goal: s.goal }))
  const markers: FieldMarker[] = shots.map((s) => ({
    x: s.x,
    y: s.y,
    color: s.goal ? '#06d6a0' : '#ef476f',
    r: s.goal ? 4.5 : 3,
  }))

  return (
    <div className="gev-map">
      <div className="gev-controls">
        <button type="button" className={view === 'heat' ? 'on' : ''} onClick={() => setView('heat')}>Gevaarzone</button>
        <button type="button" className={view === 'dots' ? 'on' : ''} onClick={() => setView('dots')}>Pogingen</button>
      </div>
      <FieldSchema
        className="gev-field"
        convPoints={view === 'heat' ? convPoints : undefined}
        markers={view === 'dots' ? markers : []}
        ends={{ bottom: { text: '▼ Doel', color: '#06d6a0' } }}
      />
      {view === 'heat' ? (
        <div className="gev-legend">
          <span className="gev-scale" /> <span>zwak → gevaarlijk (scoringskans)</span>
          <span className="gev-note">van waar hij gooit · {shots.length} pogingen</span>
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
