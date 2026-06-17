'use client'

import { useEffect, useState } from 'react'

import type { DevAxis, PlayerDevBadge, PlayerDevelopment } from '@/lib/player-development'
import './ontwikkeling.css'

const TIER_COLOR: Record<string, string> = {
  Brons: '#cd7f32',
  Zilver: '#cbd5e1',
  Goud: '#fbbf24',
  Platina: '#7fdbff',
  Diamant: '#b9f2ff',
  Legende: '#c084fc',
}
const TIER_EMOJI: Record<string, string> = {
  Brons: '🥉',
  Zilver: '🥈',
  Goud: '🥇',
  Platina: '🏅',
  Diamant: '💎',
  Legende: '👑',
}

// Telt soepel op naar `target` zodra `run` waar is (cubic ease-out).
function useCountUp(target: number, run: boolean, ms = 900): number {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!run || target <= 0) {
      setVal(Math.max(0, target))
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, run, ms])
  return val
}

function Ring({ axis }: { axis: DevAxis }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(t)
  }, [])
  const R = 40
  const C = 2 * Math.PI * R
  const offset = mounted ? C * (1 - axis.pct / 100) : C
  return (
    <div className="dev-ring">
      <svg viewBox="0 0 96 96" aria-hidden>
        <circle className="dev-ring-track" cx="48" cy="48" r={R} />
        <circle className="dev-ring-prog" cx="48" cy="48" r={R} strokeDasharray={C} strokeDashoffset={offset} />
      </svg>
      <div className="dev-ring-center">
        <span className="dev-ring-lvl">{axis.level}</span>
        <span className="dev-ring-lvl-lbl">niveau</span>
      </div>
    </div>
  )
}

function AxisCard({ axis, color, icon, sub, run }: { axis: DevAxis; color: string; icon: string; sub: string; run: boolean }) {
  const score = useCountUp(axis.score, run)
  const toNext = axis.nextAt != null ? Math.max(0, axis.nextAt - axis.score) : 0
  return (
    <div className="dev-axis" style={{ ['--axis-c' as string]: color }}>
      <Ring axis={axis} />
      <div className="dev-axis-body">
        <span className="dev-axis-label">
          <span aria-hidden>{icon}</span> {axis.label} · {sub}
        </span>
        <p className="dev-axis-name">{axis.levelName}</p>
        <span className="dev-axis-score">
          <b>{score}</b> punten
        </span>
        <p className="dev-axis-next">
          {axis.maxed ? 'Hoogste niveau bereikt ✨' : `Nog ${toNext} tot niveau ${axis.level + 1}`}
        </p>
      </div>
    </div>
  )
}

function BadgeCard({ b, color }: { b: PlayerDevBadge; color: string }) {
  return (
    <div className={`dev-badge${b.earned ? ' is-earned' : ''}`} style={{ ['--badge-c' as string]: color }}>
      <span className="dev-badge-emoji" aria-hidden>
        {b.emoji}
      </span>
      <span className="dev-badge-title">{b.title}</span>
      <span className="dev-badge-desc">{b.desc}</span>
      {b.earned ? (
        <span className="dev-badge-state">✓ Verdiend</span>
      ) : b.progress ? (
        <span className="dev-badge-prog">
          <span className="dev-badge-prog-bar">
            <i style={{ width: `${Math.round((b.progress.have / b.progress.need) * 100)}%` }} />
          </span>
          <span className="dev-badge-prog-txt">
            {b.progress.have}/{b.progress.need}
          </span>
        </span>
      ) : (
        <span className="dev-badge-locked">Vergrendeld</span>
      )}
    </div>
  )
}

function BadgeGroup({ title, icon, color, badges }: { title: string; icon: string; color: string; badges: PlayerDevBadge[] }) {
  if (badges.length === 0) return null
  return (
    <div className="dev-bgroup">
      <h3 className="dev-bgroup-title">
        <span aria-hidden>{icon}</span> {title}
      </h3>
      <div className="dev-bgrid">
        {badges.map((b) => (
          <BadgeCard key={b.key} b={b} color={color} />
        ))}
      </div>
    </div>
  )
}

export function SpelerOntwikkeling({ dev }: { dev: PlayerDevelopment }) {
  const [run, setRun] = useState(false)
  useEffect(() => {
    const t = requestAnimationFrame(() => setRun(true))
    return () => cancelAnimationFrame(t)
  }, [])

  const overallScore = useCountUp(dev.overall.score, run)
  const tierColor = TIER_COLOR[dev.overall.tier] ?? '#cd7f32'
  const skillBadges = dev.badges.filter((b) => b.axis === 'skill')
  const fameBadges = dev.badges.filter((b) => b.axis === 'fame')
  const badgePct = dev.totalBadges > 0 ? Math.round((dev.earnedBadges / dev.totalBadges) * 100) : 0
  const toNextTier = dev.overall.nextAt != null ? Math.max(0, dev.overall.nextAt - dev.overall.score) : 0

  return (
    <section className="dev" style={{ ['--tier-c' as string]: tierColor }}>
      <div className="dev-hero">
        <div className="dev-medal">
          <span className="dev-medal-emoji" aria-hidden>
            {TIER_EMOJI[dev.overall.tier] ?? '🏅'}
          </span>
        </div>
        <div className="dev-hero-body">
          <span className="dev-eyebrow">Spelersontwikkeling</span>
          <h2 className="dev-hero-title">
            {dev.overall.tier}
            <span className="dev-hero-lvl">· niveau {dev.overall.level}</span>
          </h2>
          <div className="dev-hero-bar">
            <i style={{ width: run ? `${dev.overall.pct}%` : '0%' }} />
          </div>
          <p className="dev-hero-sub">
            <span>
              {dev.overall.maxed
                ? 'Maximaal niveau bereikt 👑'
                : `Nog ${toNextTier} tot ${dev.overall.nextTier}`}
            </span>
            <b>{overallScore} ontwikkelingspunten</b>
          </p>
        </div>
      </div>

      <div className="dev-axes">
        <AxisCard axis={dev.skill} color="var(--skill-c)" icon="🎯" sub="beter worden" run={run} />
        <AxisCard axis={dev.fame} color="var(--fame-c)" icon="⭐" sub="erkenning" run={run} />
      </div>

      <div className="dev-badges">
        <div className="dev-badges-head">
          <span className="dev-badges-count">
            {dev.earnedBadges}
            <i>/{dev.totalBadges}</i>
          </span>
          <span className="dev-badges-lbl">badges verdiend</span>
          <span className="dev-badges-bar">
            <i style={{ width: run ? `${badgePct}%` : '0%' }} />
          </span>
        </div>
        <BadgeGroup title="Skill" icon="🎯" color="var(--skill-c)" badges={skillBadges} />
        <BadgeGroup title="Fame" icon="⭐" color="var(--fame-c)" badges={fameBadges} />
      </div>
    </section>
  )
}
