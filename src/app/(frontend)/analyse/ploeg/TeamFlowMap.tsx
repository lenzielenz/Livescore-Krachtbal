'use client'

import { useState } from 'react'

import { FieldSchema, type ConvPoint, type FieldMarker } from '@/components/FieldSchema'
import type { Point } from '@/lib/field'
import type { DangerShot } from '@/lib/player-danger'

// Worp- & scoreflow van een hele ploeg op één veld. Alle doelpogingen zijn gespiegeld naar één
// canonieke aanvalsrichting (doel onderaan), zodat je in één beeld ziet:
//  • Scoreflow — van waar ze gooien → waar ze scoren (traject per doelpunt, rugworp in goud);
//  • Worphitte — heatzones van waar ze het meest smijten (vertrekpunten);
//  • Doelhitte — heatzones van waar hun doelpunten binnenvallen (landingsplek aan het doel);
//  • Gevaarzone — conversie per zone (van waar zijn ze het gevaarlijkst).
type Mode = 'flow' | 'worpen' | 'doelpunten' | 'gevaar'

const C_GOAL = '#06d6a0'
const C_RUG = '#ffd166'
const C_MISS = '#ef476f'

export function TeamFlowMap({ shots }: { shots: DangerShot[] }) {
  const [mode, setMode] = useState<Mode>('flow')
  const [withMisses, setWithMisses] = useState(false)

  const goals = shots.filter((s) => s.goal)
  const rugGoals = goals.filter((s) => s.type === 'rug').length
  const origins: Point[] = shots.map((s) => ({ x: s.x, y: s.y }))
  const goalLandings: Point[] = goals.map((s) => ({ x: s.landX, y: s.landY }))
  const convPoints: ConvPoint[] = shots.map((s) => ({ x: s.x, y: s.y, goal: s.goal }))

  // Flow-trajecten: lijn van vertrekpunt (fromX/fromY) naar landingsplek (x/y).
  const flowSource = withMisses ? shots : goals
  const markers: FieldMarker[] =
    mode === 'flow'
      ? flowSource.map((s) => ({
          x: s.landX,
          y: s.landY,
          fromX: s.x,
          fromY: s.y,
          color: s.goal ? (s.type === 'rug' ? C_RUG : C_GOAL) : C_MISS,
          r: s.goal ? 4 : 2.4,
        }))
      : []

  return (
    <div className="gev-map flow-map">
      <div className="gev-controls">
        <button type="button" className={mode === 'flow' ? 'on' : ''} onClick={() => setMode('flow')}>Scoreflow</button>
        <button type="button" className={mode === 'worpen' ? 'on' : ''} onClick={() => setMode('worpen')}>Worphitte</button>
        <button type="button" className={mode === 'doelpunten' ? 'on' : ''} onClick={() => setMode('doelpunten')}>Doelhitte</button>
        <button type="button" className={mode === 'gevaar' ? 'on' : ''} onClick={() => setMode('gevaar')}>Gevaarzone</button>
      </div>

      <FieldSchema
        className="gev-field"
        half="bottom"
        convMinAttempts={1}
        heatPoints={mode === 'worpen' ? origins : mode === 'doelpunten' ? goalLandings : undefined}
        convPoints={mode === 'gevaar' ? convPoints : undefined}
        markers={markers}
        ends={{ bottom: { text: '▼ Doel', color: C_GOAL } }}
      />

      {mode === 'flow' ? (
        <div className="gev-legend">
          <span><i style={{ background: C_GOAL }} /> doelpunt (nek)</span>
          <span><i style={{ background: C_RUG }} /> rugworp (+2)</span>
          {withMisses && <span><i style={{ background: C_MISS }} /> gemist</span>}
          <label className="flow-check">
            <input type="checkbox" checked={withMisses} onChange={(e) => setWithMisses(e.target.checked)} /> ook gemiste pogingen
          </label>
          <span className="gev-note">van waar ze gooien → waar ze scoren · {goals.length} doelpunten{rugGoals ? ` (${rugGoals} rug)` : ''}</span>
        </div>
      ) : mode === 'worpen' ? (
        <div className="gev-legend">
          <span className="gev-scale" /> <span>weinig → veel worpen</span>
          <span className="gev-note">vanwaar ze het meest smijten · {shots.length} pogingen</span>
        </div>
      ) : mode === 'doelpunten' ? (
        <div className="gev-legend">
          <span className="gev-scale" /> <span>weinig → veel doelpunten</span>
          <span className="gev-note">waar hun doelpunten binnenvallen · {goals.length} doelpunten</span>
        </div>
      ) : (
        <div className="gev-legend">
          <span className="gev-scale" /> <span>weinig kans → gevaarlijk (scoringskans)</span>
          <span className="gev-note">vanwaar ze aanvallend het gevaarlijkst zijn · {shots.length} pogingen</span>
        </div>
      )}
    </div>
  )
}
