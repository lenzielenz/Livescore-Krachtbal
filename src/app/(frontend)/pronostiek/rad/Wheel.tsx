'use client'

import { useRef, useState } from 'react'

import './rad.css'

type Colors = { primary: string; secondary: string }

// Het bonusrad in Las Vegas-stijl: marquee-lampjes, neon-gloed, geluid en confetti. In het midden
// staat je clublogo en de kleuren komen van je club — zodat het rad helemaal van jóu voelt. De
// server kiest gezaghebbend de vermenigvuldiger (POST /api/pronostiek/spin); het rad animeert er
// enkel naartoe. Wat je wint, krijg je als 3 persoonlijke boosters voor je volgende voorspellingen.
export function Wheel({
  segments,
  clubLogoUrl,
  clubColors,
  clubName,
  tokens,
}: {
  segments: number[]
  clubLogoUrl: string | null
  clubColors: Colors | null
  clubName: string
  tokens: number
}) {
  const n = segments.length
  const seg = 360 / Math.max(1, n)
  const [rotation, setRotation] = useState(0)
  const [busy, setBusy] = useState(false)
  const [won, setWon] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [confetti, setConfetti] = useState(false)
  const rotRef = useRef(0)
  const acRef = useRef<AudioContext | null>(null)

  const primary = clubColors?.primary ?? '#06d6a0'
  const secondary = clubColors?.secondary ?? '#118ab2'
  const segColor = (v: number, i: number) =>
    v >= 10 ? '#ffd166' : v >= 5 ? `color-mix(in srgb, ${primary} 55%, #ffd166)` : i % 2 === 0 ? primary : secondary
  const gradient = `conic-gradient(${segments
    .map((v, i) => `${segColor(v, i)} ${(i * seg).toFixed(2)}deg ${((i + 1) * seg).toFixed(2)}deg`)
    .join(', ')})`

  // ── Geluid (Web Audio, geen assets nodig) ──
  const ac = () => {
    if (!acRef.current) {
      const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
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
    // Ratel die vertraagt: tikjes met oplopende tussentijd.
    let t = 0
    let gap = 0.05
    while (t < durMs / 1000) {
      tone(880, t0 + t, 0.03, 'square', 0.07)
      t += gap
      gap *= 1.08
    }
  }
  const playWin = (big: boolean) => {
    const c = ac()
    const t0 = c.currentTime + 0.02
    const notes = big ? [523, 659, 784, 1047, 1319] : [523, 659, 784]
    notes.forEach((f, i) => tone(f, t0 + i * 0.12, 0.25, 'triangle', 0.2))
  }

  const spin = async () => {
    if (busy || won != null) return
    setBusy(true)
    setErr(null)
    try {
      ac().resume?.()
    } catch {}
    try {
      const res = await fetch('/api/pronostiek/spin', { method: 'POST', credentials: 'include' })
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; mult?: number }
      if (!res.ok || !j.ok || typeof j.mult !== 'number') throw new Error(j.error || 'Draaien mislukt.')
      const mult = j.mult
      // Kies een segment met die waarde om naartoe te draaien.
      const candidates = segments.map((v, i) => (v === mult ? i : -1)).filter((i) => i >= 0)
      const idx = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : 0
      const target = Math.ceil(rotRef.current / 360) * 360 + 6 * 360 + (360 - (idx + 0.5) * seg)
      rotRef.current = target
      const durMs = 4200
      playSpin(durMs)
      setRotation(target)
      window.setTimeout(() => {
        setWon(mult)
        setConfetti(true)
        playWin(mult >= 5)
        window.setTimeout(() => setConfetti(false), 2600)
        setBusy(false)
      }, durMs)
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  const fmt = (v: number) => `×${Number.isInteger(v) ? v : v.toString().replace('.', ',')}`

  return (
    <div className="rad" style={{ ['--rad-p' as string]: primary, ['--rad-s' as string]: secondary }}>
      <div className={`rad-stage${busy ? ' spinning' : ''}`}>
        {/* Marquee-lampjes rond de rand (Vegas). */}
        <div className="rad-bulbs" aria-hidden>
          {Array.from({ length: 24 }).map((_, i) => (
            <span key={i} className="rad-bulb" style={{ transform: `translate(-50%,-50%) rotate(${i * 15}deg) translateY(-148px)`, animationDelay: `${(i % 8) * 0.1}s` }} />
          ))}
        </div>
        <span className="rad-pointer" aria-hidden>▼</span>
        <div className="rad-wheel" style={{ background: gradient, transform: `rotate(${rotation}deg)` }} role="img" aria-label="Bonusrad">
          {segments.map((v, i) => (
            <span key={i} className="rad-lab" style={{ transform: `translate(-50%,-50%) rotate(${(i + 0.5) * seg}deg) translateY(-96px)` }}>
              {fmt(v)}
            </span>
          ))}
        </div>
        <div className="rad-hub" aria-hidden>
          {clubLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={clubLogoUrl} alt="" className="rad-hub-logo" />
          ) : (
            <span className="rad-hub-fallback">🎰</span>
          )}
        </div>
        {confetti && (
          <div className="rad-confetti" aria-hidden>
            {Array.from({ length: 44 }).map((_, i) => (
              <span
                key={i}
                className="rad-cf"
                style={{
                  left: `${Math.random() * 100}%`,
                  background: [primary, secondary, '#ffd166', '#fff'][i % 4],
                  animationDelay: `${Math.random() * 0.5}s`,
                  transform: `rotate(${Math.random() * 360}deg)`,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {won == null ? (
        <button className="rad-btn" onClick={spin} disabled={busy}>
          {busy ? 'Draaien…' : `🎰 Draai het rad van ${clubName}`}
        </button>
      ) : (
        <div className="rad-prize">
          <div className={`rad-prize-x${won >= 5 ? ' jackpot' : ''}`}>{fmt(won)}</div>
          <p className="rad-prize-txt">
            Gewonnen! Je krijgt <b>3 boosters van {fmt(won)}</b>. Gebruik ze bij het voorspellen — jij kiest op welke wedstrijden.
          </p>
        </div>
      )}
      {won == null && tokens > 0 && (
        <p className="rad-have">Je hebt nog <b>{tokens}</b> booster(s) klaarstaan.</p>
      )}
      {err && <p className="rad-err">{err}</p>}
    </div>
  )
}
