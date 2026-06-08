'use client'

import { useState } from 'react'

import { FieldSchema, type ConvPoint, type FieldMarker } from '@/components/FieldSchema'
import type { Point } from '@/lib/field'
import type { DangerShot, FlowShot } from '@/lib/player-danger'

// Worp- & scoreflow van een hele ploeg op één veld. Alle worpen zijn gespiegeld naar één canonieke
// aanvalsrichting (doel onderaan), zodat je in één beeld ziet:
//  • Scoreflow — van waar ze gooien → waar de bal naartoe gaat, per worp (1e/2e/laatste of alle),
//    met de richting en de uitkomst in kleur;
//  • Worphitte — heatzones van waar ze het meest smijten (vertrekpunten);
//  • Doelhitte — heatzones van waar hun doelpunten binnenvallen (landingsplek aan het doel);
//  • Gevaarzone — conversie per zone (van waar zijn ze het gevaarlijkst).
type Mode = 'flow' | 'opzet' | 'worpen' | 'doelpunten' | 'gevaar'
type ThrowSel = 'all' | 1 | 2 | 'last'

const C_GOAL = '#06d6a0' // doelpunt (nek)
const C_RUG = '#ffd166' // rugworp-doelpunt (+2)
const C_LOSS = '#ef476f' // balverlies (gevangen / buiten)
const C_ADV = '#4cc9f0' // doorspelende worp (geen afronding)

function flowColor(s: FlowShot): string {
  if (s.goal) return s.type === 'rug' ? C_RUG : C_GOAL
  if (s.outcome === 'caught' || s.outcome === 'out_side' || s.outcome === 'out_back') return C_LOSS
  return C_ADV
}

const THROW_OPTS: [ThrowSel, string][] = [
  ['all', 'Alle'],
  [1, '1e'],
  [2, '2e'],
  ['last', 'Laatste'],
]

export function TeamFlowMap({ shots, flowShots = [] }: { shots: DangerShot[]; flowShots?: FlowShot[] }) {
  const [mode, setMode] = useState<Mode>('flow')
  // Welke worp tonen we in de flow? Standaard de afrondende (laatste) worp.
  const [throwSel, setThrowSel] = useState<ThrowSel>('last')

  const goals = shots.filter((s) => s.goal)
  const origins: Point[] = shots.map((s) => ({ x: s.x, y: s.y }))
  const goalLandings: Point[] = goals.map((s) => ({ x: s.landX, y: s.landY }))
  const convPoints: ConvPoint[] = shots.map((s) => ({ x: s.x, y: s.y, goal: s.goal }))
  // Opzet: van waar ze hun balbezit opzetten = de vertrekpunten van de 1e worp.
  const opzetOrigins: Point[] = flowShots.filter((s) => s.throwNumber === 1).map((s) => ({ x: s.x, y: s.y }))

  // Flow-trajecten: van vertrekpunt (x/y) naar landingsplek (landX/landY), per gekozen worp.
  const flowSel = flowShots.filter((s) =>
    throwSel === 'all' ? true : throwSel === 'last' ? s.isLast : s.throwNumber === throwSel,
  )
  const flowGoals = flowSel.filter((s) => s.goal).length
  const markers: FieldMarker[] =
    mode === 'flow'
      ? flowSel.map((s) => ({
          x: s.landX,
          y: s.landY,
          fromX: s.x,
          fromY: s.y,
          color: flowColor(s),
          r: s.goal ? 4 : 2.6,
        }))
      : []

  return (
    <div className="gev-map flow-map">
      <div className="gev-controls">
        <button type="button" className={mode === 'flow' ? 'on' : ''} onClick={() => setMode('flow')}>Scoreflow</button>
        <button type="button" className={mode === 'opzet' ? 'on' : ''} onClick={() => setMode('opzet')}>Opzet</button>
        <button type="button" className={mode === 'worpen' ? 'on' : ''} onClick={() => setMode('worpen')}>Worphitte</button>
        <button type="button" className={mode === 'doelpunten' ? 'on' : ''} onClick={() => setMode('doelpunten')}>Doelhitte</button>
        <button type="button" className={mode === 'gevaar' ? 'on' : ''} onClick={() => setMode('gevaar')}>Gevaarzone</button>
      </div>

      {mode === 'flow' && (
        <div className="gev-controls flow-throwsel">
          <span className="flow-throwsel-lbl">Worp:</span>
          {THROW_OPTS.map(([v, l]) => (
            <button key={String(v)} type="button" className={throwSel === v ? 'on' : ''} onClick={() => setThrowSel(v)}>{l}</button>
          ))}
        </div>
      )}

      <FieldSchema
        className="gev-field"
        half={mode === 'doelpunten' ? undefined : 'bottom'}
        zoom={mode === 'doelpunten' ? 'goal' : undefined}
        convMinAttempts={1}
        heatPoints={mode === 'worpen' ? origins : mode === 'opzet' ? opzetOrigins : mode === 'doelpunten' ? goalLandings : undefined}
        convPoints={mode === 'gevaar' ? convPoints : undefined}
        markers={markers}
        ends={{ bottom: { text: '▼ Doel', color: C_GOAL } }}
      />

      {mode === 'flow' ? (
        <div className="gev-legend">
          <span><i style={{ background: C_GOAL }} /> doelpunt</span>
          <span><i style={{ background: C_RUG }} /> rugworp (+2)</span>
          <span><i style={{ background: C_LOSS }} /> balverlies</span>
          <span><i style={{ background: C_ADV }} /> doorspelend</span>
          <span className="gev-note">
            van waar → waar naartoe · {flowSel.length} {flowSel.length === 1 ? 'worp' : 'worpen'}
            {flowGoals ? ` · ${flowGoals} doelpunt${flowGoals === 1 ? '' : 'en'}` : ''}
          </span>
        </div>
      ) : mode === 'opzet' ? (
        <div className="gev-legend">
          <span className="gev-scale" /> <span>weinig → veel opzetten</span>
          <span className="gev-note">van waar ze hun balbezit opzetten · {opzetOrigins.length} opzetten</span>
        </div>
      ) : mode === 'worpen' ? (
        <div className="gev-legend">
          <span className="gev-scale" /> <span>weinig → veel worpen</span>
          <span className="gev-note">vanwaar ze het meest smijten · {shots.length} pogingen</span>
        </div>
      ) : mode === 'doelpunten' ? (
        <div className="gev-legend">
          <span className="gev-scale" /> <span>weinig → veel doelpunten</span>
          <span className="gev-note">waar ze in het doelgebied scoren · {goals.length} doelpunten</span>
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
