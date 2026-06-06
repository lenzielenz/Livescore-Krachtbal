'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { FieldSchema, type FieldMarker } from '@/components/FieldSchema'
import type { ShotPoint } from '@/lib/match-engine'

const OUTCOME_COLOR: Record<string, string> = {
  goal: '#06d6a0',
  caught: '#4cc9f0',
  out_side: '#ef476f',
  out_back: '#f78c6b',
  in_field: '#8fb3a1',
}
const OUTCOME_LABEL: Record<string, string> = {
  goal: 'doelpunt',
  caught: 'gevangen',
  out_side: 'buiten (zij)',
  out_back: 'buiten (achter)',
  in_field: 'in het veld',
}

// Animatie ("video") van het wedstrijdverloop: speelt de worpen chronologisch af, met de bal die
// over het veld reist langs elk traject. De volgorde van `shots` is al chronologisch (createdAt).
export function FlowReplay({
  shots,
  teams,
  goalAreaDepth = 10,
}: {
  shots: ShotPoint[]
  teams: { home: string; away: string }
  goalAreaDepth?: number
}) {
  const [playing, setPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [team, setTeam] = useState<'both' | 'home' | 'away'>('both')
  const lastTs = useRef(0)

  // Enkel de gekozen ploeg afspelen (thuis/uit) of allebei.
  const playShots = useMemo(
    () => (team === 'both' ? shots : shots.filter((s) => s.teamSide === team)),
    [shots, team],
  )

  const total = playShots.length
  const stepMs = 900 / speed
  const totalMs = total * stepMs

  // Reset wanneer de selectie (filters/ploeg) verandert.
  useEffect(() => {
    setElapsed(0)
    setPlaying(false)
  }, [playShots])

  useEffect(() => {
    if (!playing) return
    let raf = 0
    lastTs.current = performance.now()
    const tick = (t: number) => {
      const dt = t - lastTs.current
      lastTs.current = t
      setElapsed((e) => {
        const n = e + dt
        if (n >= totalMs) {
          setPlaying(false)
          return totalMs
        }
        return n
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, totalMs])

  const step = total ? Math.min(Math.floor(elapsed / stepMs), total) : 0
  const within = total ? (elapsed - step * stepMs) / stepMs : 0

  const { markers, current } = useMemo(() => {
    const ms: FieldMarker[] = playShots.slice(0, step).map((s) => ({
      x: s.x,
      y: s.y,
      fromX: s.fromX,
      fromY: s.fromY,
      color: OUTCOME_COLOR[s.outcome] ?? '#ffd166',
      r: s.outcome === 'goal' ? 7 : 5,
      label: String(s.throwNumber),
    }))
    let cur: ShotPoint | null = null
    if (step < total) {
      const s = playShots[step]
      const tp = Math.min(1, within / 0.7) // eerste 70% = reizen, rest = even blijven hangen
      ms.push({
        x: s.fromX + (s.x - s.fromX) * tp,
        y: s.fromY + (s.y - s.fromY) * tp,
        fromX: s.fromX,
        fromY: s.fromY,
        color: '#ffd166',
        r: 7,
      })
      cur = s
    }
    return { markers: ms, current: cur }
  }, [playShots, step, within, total])

  const play = () => {
    if (elapsed >= totalMs) setElapsed(0)
    setPlaying(true)
  }

  // Live stand: tel de doelpunten tot nu (de huidige worp telt pas mee zodra de bal geland is).
  const score = useMemo(() => {
    const scoredN = step + (current && within >= 0.7 ? 1 : 0)
    let h = 0
    let a = 0
    for (const s of playShots.slice(0, scoredN)) {
      if (s.outcome !== 'goal') continue
      const pts = s.type === 'rug' ? 2 : 1
      if (s.teamSide === 'home') h += pts
      else a += pts
    }
    return { h, a }
  }, [playShots, step, within, current])

  if (shots.length === 0) {
    return <p className="empty">Geen worpen in deze selectie om af te spelen.</p>
  }

  const shown = current ? step + 1 : step
  return (
    <div className="replay">
      <div className="replay-score">
        <span className="rs-team">{teams.home}</span>
        <span className="rs-num side-home">{score.h}</span>
        <span className="rs-dash">–</span>
        <span className="rs-num side-away">{score.a}</span>
        <span className="rs-team">{teams.away}</span>
      </div>
      {/* Toon beide ploegen, of speel enkel thuis / enkel uit af. */}
      <div className="shotmap-controls replay-teams">
        <button type="button" className={team === 'both' ? 'on' : ''} onClick={() => setTeam('both')}>Beide</button>
        <button type="button" className={`side-home ${team === 'home' ? 'on' : ''}`} onClick={() => setTeam('home')}>🏠 {teams.home}</button>
        <button type="button" className={`side-away ${team === 'away' ? 'on' : ''}`} onClick={() => setTeam('away')}>🚌 {teams.away}</button>
      </div>
      <div className="shotmap-controls replay-controls">
        <button type="button" className="replay-play" onClick={() => (playing ? setPlaying(false) : play())} disabled={total === 0}>
          {playing ? '⏸ Pauze' : elapsed >= totalMs ? '↻ Opnieuw' : '▶ Speel af'}
        </button>
        <button type="button" className={speed === 1 ? 'on' : ''} onClick={() => setSpeed(1)}>1×</button>
        <button type="button" className={speed === 2 ? 'on' : ''} onClick={() => setSpeed(2)}>2×</button>
      </div>
      <input
        className="replay-scrub"
        type="range"
        min={0}
        max={Math.max(1, Math.round(totalMs))}
        value={Math.round(elapsed)}
        onChange={(e) => {
          setPlaying(false)
          setElapsed(Number(e.target.value))
        }}
        aria-label="Tijdlijn"
      />
      <FieldSchema className="shotmap-field" markers={markers} goalAreaDepthM={goalAreaDepth} />
      {total === 0 && <p className="sb-dim" style={{ textAlign: 'center' }}>Geen worpen van deze ploeg.</p>}
      <div className="replay-status">
        <span className="replay-step">worp {shown}/{total}</span>
        {current && (
          <span className="replay-info">
            #{current.shirtNumber} · {current.type === 'rug' ? 'rugworp (+2)' : 'nekworp (+1)'} ·{' '}
            <span style={{ color: OUTCOME_COLOR[current.outcome] }}>{OUTCOME_LABEL[current.outcome] ?? current.outcome}</span>
          </span>
        )}
        {!current && elapsed >= totalMs && <span className="replay-info">Einde — {total} worpen afgespeeld.</span>}
      </div>
    </div>
  )
}
