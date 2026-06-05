'use client'

import { useState } from 'react'

import { FieldSchema, type ConvPoint, type FieldMarker } from '@/components/FieldSchema'
import type { DangerShot } from '@/lib/expected-points'

// Halfveld-gevaarkaart van de hele reeks: van waar op het veld scoort men het makkelijkst?
// Elke zone kleurt van rood (moeilijk) naar groen (makkelijk) volgens de scoringskans, met
// onderscheid links/midden/rechts. Beide helften zijn naar één doel (onderaan) gespiegeld.
export function ScoringField({ shots }: { shots: DangerShot[] }) {
  const [view, setView] = useState<'heat' | 'dots'>('heat')

  const convPoints: ConvPoint[] = shots.map((s) => ({ x: s.x, y: s.y, goal: s.goal }))
  const markers: FieldMarker[] = shots.map((s) => ({
    x: s.x,
    y: s.y,
    color: s.goal ? '#06d6a0' : '#ef476f',
    r: s.goal ? 4 : 2.5,
  }))

  return (
    <div className="gev-map">
      <div className="gev-controls">
        <button type="button" className={view === 'heat' ? 'on' : ''} onClick={() => setView('heat')}>Scoringsgraad</button>
        <button type="button" className={view === 'dots' ? 'on' : ''} onClick={() => setView('dots')}>Pogingen</button>
      </div>
      <FieldSchema
        className="gev-field"
        half="bottom"
        convPoints={view === 'heat' ? convPoints : undefined}
        markers={view === 'dots' ? markers : []}
        ends={{ bottom: { text: '▼ Doel', color: '#06d6a0' } }}
      />
      {view === 'heat' ? (
        <div className="gev-legend">
          <span className="gev-scale" /> <span>moeilijk → makkelijk scoren</span>
          <span className="gev-note">van waar geworpen · {shots.length} pogingen</span>
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
