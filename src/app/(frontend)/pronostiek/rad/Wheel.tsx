'use client'

import { useRef, useState } from 'react'

import { segmentArcs, type RadSegment } from '@/lib/pronostiek-rad'
import './rad.css'

const fmt = (v: number) => `×${Number.isInteger(v) ? v : String(v).replace('.', ',')}`

// Het bonusrad in Las Vegas-stijl: ongelijke taartpunten, marquee-lampjes, neon-achterglow, geluid
// en confetti. In het midden staat je clublogo; de punten dragen de kleuren van de deelnemende
// clubs. Je mag tot 3 keer draaien en wint telkens een booster. De server kiest gezaghebbend het
// vak (POST /api/pronostiek/spin); het rad animeert er enkel naartoe.
export function Wheel({
  segments,
  clubColors,
  clubLogoUrl,
  clubName,
  spinsLeft: initialSpins,
  heldTokens,
}: {
  segments: RadSegment[]
  clubColors: { primary: string; secondary: string } | null
  clubLogoUrl: string | null
  clubName: string
  spinsLeft: number
  heldTokens: number[]
}) {
  const arcs = segmentArcs(segments)
  const primary = clubColors?.primary ?? '#06d6a0'
  const secondary = clubColors?.secondary ?? '#0b3d2e'
  const GOLD = '#ffd166'
  const maxMult = Math.max(...segments.map((s) => s.mult))
  const pal = [primary, secondary, GOLD]
  const [rotation, setRotation] = useState(0)
  const [busy, setBusy] = useState(false)
  const [spinsLeft, setSpinsLeft] = useState(initialSpins)
  const [won, setWon] = useState<number[]>([])
  const [lastWon, setLastWon] = useState<number | null>(null)
  const [confetti, setConfetti] = useState(false)
  const [jackpot, setJackpot] = useState<'mega' | 'big' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const rotRef = useRef(0)
  const acRef = useRef<AudioContext | null>(null)

  // De clubkleuren wisselen elkaar af; de hoogste waarde (jackpot) krijgt altijd goud.
  const color = (i: number, mult: number) => (mult === maxMult ? GOLD : i % 2 === 0 ? primary : secondary)
  const gradient = `conic-gradient(from 0deg, ${arcs
    .map((a, i) => `${color(i, a.mult)} ${a.start.toFixed(2)}deg ${a.end.toFixed(2)}deg`)
    .join(', ')})`
  // Achterglow: dezelfde kleuren, zachter en groter — draait mee tijdens het spinnen.
  const auraGradient = `conic-gradient(from 0deg, ${pal.concat(pal).map((c, i, arr) => `${c} ${((i / arr.length) * 360).toFixed(1)}deg ${(((i + 1) / arr.length) * 360).toFixed(1)}deg`).join(', ')})`

  // ── Geluid (Web Audio, geen assets) ──
  const ac = () => {
    if (!acRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      acRef.current = new Ctx()
    }
    return acRef.current!
  }
  const tone = (freq: number, t0: number, dur: number, type: OscillatorType = 'triangle', gain = 0.18) => {
    const c = ac()
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = type
    o.frequency.value = freq
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(g).connect(c.destination)
    o.start(t0)
    o.stop(t0 + dur + 0.02)
  }
  const playSpin = (durMs: number) => {
    const c = ac()
    const t0 = c.currentTime
    // Tikjes van de flapper langs de pinnen — vertragen naar het einde (spanning).
    let t = 0
    let gap = 0.03
    while (t < durMs / 1000) {
      tone(900, t0 + t, 0.024, 'square', 0.06)
      t += gap
      gap *= 1.065
    }
    // Oplopende spannings-riser onder de tikjes.
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(110, t0)
    o.frequency.exponentialRampToValueAtTime(420, t0 + durMs / 1000)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.3)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000)
    o.connect(g).connect(c.destination)
    o.start(t0)
    o.stop(t0 + durMs / 1000 + 0.05)
  }
  const playWin = (level: 'mega' | 'big' | 'normal') => {
    const c = ac()
    const t0 = c.currentTime + 0.02
    if (level === 'normal') {
      ;[523, 659, 784, 1047].forEach((f, i) => tone(f, t0 + i * 0.1, 0.26, 'triangle', 0.2))
      return
    }
    // Groot: triomfantelijke fanfare (×5) of een dubbele jackpot-cascade (×10) met sprankel-coins.
    const fanfare = [523, 659, 784, 1047, 1319, 1568, 2093]
    fanfare.forEach((f, i) => tone(f, t0 + i * 0.1, 0.34, 'triangle', 0.22))
    if (level === 'mega') {
      fanfare.forEach((f, i) => tone(f * 1.5, t0 + 0.7 + i * 0.09, 0.3, 'triangle', 0.2))
      for (let i = 0; i < 14; i++) tone(1800 + Math.random() * 1400, t0 + 0.4 + i * 0.06, 0.12, 'sine', 0.12)
    }
  }

  const spin = async () => {
    if (busy || spinsLeft <= 0) return
    setBusy(true)
    setErr(null)
    setLastWon(null)
    try {
      ac().resume?.()
    } catch {}
    try {
      const res = await fetch('/api/pronostiek/spin', { method: 'POST', credentials: 'include' })
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; index?: number; mult?: number; spinsLeft?: number }
      if (!res.ok || !j.ok || typeof j.index !== 'number' || typeof j.mult !== 'number') throw new Error(j.error || 'Draaien mislukt.')
      const arc = arcs[j.index] ?? arcs[0]
      const target = Math.ceil(rotRef.current / 360) * 360 + 9 * 360 + (360 - arc.mid)
      rotRef.current = target
      const durMs = 7000
      playSpin(durMs)
      setRotation(target)
      window.setTimeout(() => {
        const mult = j.mult!
        const level: 'mega' | 'big' | 'normal' = mult >= maxMult ? 'mega' : mult >= 5 ? 'big' : 'normal'
        setLastWon(mult)
        setWon((w) => [...w, mult])
        setSpinsLeft(typeof j.spinsLeft === 'number' ? j.spinsLeft : spinsLeft - 1)
        setConfetti(true)
        if (level !== 'normal') setJackpot(level)
        playWin(level)
        window.setTimeout(() => setConfetti(false), level === 'mega' ? 4200 : 2800)
        window.setTimeout(() => setJackpot(null), 3000)
        setBusy(false)
      }, durMs)
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  const labelSize = (a: { start: number; end: number }) => {
    const span = a.end - a.start
    return span >= 55 ? '1.05rem' : span >= 35 ? '0.92rem' : span >= 22 ? '0.78rem' : '0.66rem'
  }
  const allWon = [...heldTokens, ...won]

  return (
    <div className="rad">
      <div className={`rad-stage${busy ? ' spinning' : ''}`}>
        <div className="rad-aura" style={{ background: auraGradient }} aria-hidden />
        <div className="rad-bulbs" aria-hidden>
          {Array.from({ length: 28 }).map((_, i) => (
            <span key={i} className="rad-bulb" style={{ transform: `translate(-50%,-50%) rotate(${i * (360 / 28)}deg) translateY(-152px)`, animationDelay: `${(i % 8) * 0.09}s` }} />
          ))}
        </div>
        {/* Flapper-pijl: tikt langs de pinnen tijdens het draaien — je ziet aan welke kant van het
            stokje hij valt. */}
        <div className="rad-flap" aria-hidden />
        <div className="rad-wheel" style={{ background: gradient, transform: `rotate(${rotation}deg)` }} role="img" aria-label="Bonusrad">
          {arcs.map((a, i) => (
            <span key={`peg-${i}`} className="rad-peg" style={{ transform: `translate(-50%,-50%) rotate(${a.start}deg) translateY(-128px)` }} />
          ))}
          {arcs.map((a, i) => (
            <span key={i} className="rad-lab" style={{ transform: `translate(-50%,-50%) rotate(${a.mid}deg) translateY(-92px)`, fontSize: labelSize(a) }}>
              {fmt(a.mult)}
            </span>
          ))}
        </div>
        <button
          type="button"
          className={`rad-hub${spinsLeft > 0 && !busy ? ' live' : ''}`}
          onClick={spin}
          disabled={busy || spinsLeft <= 0}
          aria-label="Draai het rad"
          title="Klik om te draaien"
        >
          {clubLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={clubLogoUrl} alt="" className="rad-hub-logo" />
          ) : (
            <span className="rad-hub-fallback">🎰</span>
          )}
        </button>
        {confetti && (
          <div className="rad-confetti" aria-hidden>
            {Array.from({ length: jackpot === 'mega' ? 90 : jackpot === 'big' ? 64 : 50 }).map((_, i) => (
              <span
                key={i}
                className="rad-cf"
                style={{
                  left: `${Math.random() * 100}%`,
                  background: pal.concat(['#ffd166', '#fff', '#ef476f', '#4cc9f0'])[i % (pal.length + 4)],
                  animationDelay: `${Math.random() * 0.5}s`,
                }}
              />
            ))}
          </div>
        )}
        {jackpot && (
          <div className={`rad-jackpot rad-jackpot-${jackpot}`} aria-hidden>
            <span className="rad-jackpot-txt">{jackpot === 'mega' ? '🎉 JACKPOT!' : '🔥 TOP!'}</span>
          </div>
        )}
      </div>

      {lastWon != null && (
        <div className="rad-prize">
          <div className={`rad-prize-x${lastWon >= 5 ? ' jackpot' : ''}`}>{fmt(lastWon)}</div>
          <p className="rad-prize-txt">Gewonnen! Deze booster komt bij je voorraad.</p>
        </div>
      )}

      {spinsLeft > 0 ? (
        <button className="rad-btn" onClick={spin} disabled={busy}>
          {busy ? 'Draaien…' : `🎰 Draai het rad van ${clubName}${spinsLeft < 90 ? ` (nog ${spinsLeft})` : ''}`}
        </button>
      ) : (
        <p className="rad-done-txt">Je hebt je 3 beurten gebruikt. Gebruik je boosters bij het voorspellen — jij kiest welke op welke wedstrijd.</p>
      )}

      {allWon.length > 0 && (
        <div className="rad-tokens">
          <span className="rad-tokens-lbl">Jouw boosters:</span>
          {allWon.map((m, i) => (
            <span key={i} className={`rad-token${m >= 5 ? ' big' : ''}`}>{fmt(m)}</span>
          ))}
        </div>
      )}
      {err && <p className="rad-err">{err}</p>}
    </div>
  )
}
