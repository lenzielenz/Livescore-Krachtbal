'use client'

import { useEffect, useRef, useState } from 'react'

import { EEND_KLEUREN, VERF_KLEUREN } from '@/lib/virtueel-sporen'

// De spelletjes in de kelder, groot op je scherm:
//  • 🦆🎨 aan het zwembad: kies een kleur en werp een eendje, of giet verf in het water;
//  • 🏃 op de loopband: 20 seconden zo snel mogelijk links-rechts tikken;
//  • 🎮 Doelworp in de gameroom: 30 seconden mikken op het bewegende doel.
// Wat je doet, blijft in het stadion achter voor wie na jou komt (de viewer bewaart het).

const LOOP_S = 20
const WORP_S = 30

export function Badkiezer({ open, onSluit, onEend, onVerf, eenden }: { open: boolean; onSluit: () => void; onEend: (kleur: string) => void; onVerf: (kleur: string) => void; eenden: number }) {
  const [wat, setWat] = useState<'eend' | 'verf'>('eend')
  if (!open) return null
  const kleuren = wat === 'eend' ? EEND_KLEUREN : VERF_KLEUREN
  return (
    <div className="vk-spel vk-spel-klein" role="dialog" aria-label="Het zwembad">
      <div className="vk-graf-kop">
        <div>
          <b>🏊 Aan het zwembad</b>
          <span>{eenden} eendjes dobberen al in het bad</span>
        </div>
        <button className="vk-graf-sluit" onClick={onSluit} aria-label="Sluiten">
          ✕
        </button>
      </div>
      <div className="vk-spel-inhoud">
        <div className="vk-graf-groep">
          <button className={wat === 'eend' ? 'actief' : ''} onClick={() => setWat('eend')}>
            🦆 Eendje werpen
          </button>
          <button className={wat === 'verf' ? 'actief' : ''} onClick={() => setWat('verf')}>
            🎨 Verf in het water
          </button>
        </div>
        <p className="vk-spel-uitleg">{wat === 'eend' ? 'Kies je eendje — het blijft in het bad drijven voor wie na jou komt.' : 'Kies een kleur — het water kleurt mee met de verf van iedereen.'}</p>
        <div className="vk-spel-kleuren">
          {kleuren.map((k) => (
            <button
              key={k}
              className={`vk-spel-kleur${wat === 'eend' ? ' eend' : ''}`}
              style={{ '--k': k } as React.CSSProperties}
              aria-label={wat === 'eend' ? `Eendje in ${k}` : `Verf in ${k}`}
              onClick={() => (wat === 'eend' ? onEend(k) : onVerf(k))}
            >
              {wat === 'eend' ? '🦆' : ''}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Loopband: tik afwisselend links en rechts (of ← →). Hoe sneller je tikt, hoe harder je loopt. */
export function Loopband({ open, onSluit, onKlaar }: { open: boolean; onSluit: () => void; onKlaar: (meter: number) => void }) {
  const [fase, setFase] = useState<'klaar' | 'lopen' | 'gedaan'>('klaar')
  const [tijd, setTijd] = useState(LOOP_S)
  const [meter, setMeter] = useState(0)
  const [tempo, setTempo] = useState(0)
  const s = useRef({ vorige: '' as 'l' | 'r' | '', tikken: [] as number[], meter: 0, start: 0 })

  useEffect(() => {
    if (open) {
      setFase('klaar')
      setTijd(LOOP_S)
      setMeter(0)
      setTempo(0)
    }
  }, [open])

  useEffect(() => {
    if (fase !== 'lopen') return
    let raf = 0
    let vorig = performance.now()
    const lus = (nu: number) => {
      const dt = (nu - vorig) / 1000
      vorig = nu
      const r = s.current
      // Tempo = tikken in de laatste seconde; 8 tikken per seconde is een sprint (~24 km/u).
      r.tikken = r.tikken.filter((t) => nu - t < 1000)
      const kmu = Math.min(24, r.tikken.length * 3)
      r.meter += (kmu / 3.6) * dt
      setTempo(kmu)
      setMeter(r.meter)
      const over = LOOP_S - (nu - r.start) / 1000
      setTijd(Math.max(0, over))
      if (over <= 0) {
        setFase('gedaan')
        const m = Math.min(399, Math.round(r.meter))
        if (m >= 1) onKlaar(m)
        return
      }
      raf = requestAnimationFrame(lus)
    }
    raf = requestAnimationFrame(lus)
    return () => cancelAnimationFrame(raf)
  }, [fase, onKlaar])

  const tik = (kant: 'l' | 'r') => {
    const r = s.current
    if (fase === 'klaar') {
      r.meter = 0
      r.tikken = []
      r.start = performance.now()
      setFase('lopen')
    } else if (fase !== 'lopen') return
    if (r.vorige === kant) return
    r.vorige = kant
    r.tikken.push(performance.now())
    if ('vibrate' in navigator) navigator.vibrate?.(8)
  }

  useEffect(() => {
    if (!open) return
    const toets = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') tik('l')
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') tik('r')
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', toets)
    return () => window.removeEventListener('keydown', toets)
  })

  if (!open) return null
  return (
    <div className="vk-spel" role="dialog" aria-label="Loopband">
      <div className="vk-graf-kop">
        <div>
          <b>🏃 Loopband</b>
          <span>Tik links-rechts zo snel je kan · {LOOP_S} seconden</span>
        </div>
        <button className="vk-graf-sluit" onClick={onSluit} aria-label="Sluiten">
          ✕
        </button>
      </div>
      <div className="vk-spel-inhoud vk-loop">
        <div className="vk-loop-scherm">
          <span className="vk-loop-groot">{Math.round(meter)} m</span>
          <span>
            {tempo.toFixed(0)} km/u · {tijd.toFixed(1)} s
          </span>
          <div className="vk-loop-band" style={{ '--v': `${Math.max(0.15, 1.2 - tempo / 24)}s`, animationPlayState: fase === 'lopen' ? 'running' : 'paused' } as React.CSSProperties} />
        </div>
        {fase === 'gedaan' ? (
          <div className="vk-spel-einde">
            <b>Goed gelopen: {Math.round(meter)} m!</b>
            <span>Je meters tellen mee voor de hele club.</span>
            <button className="vk-graf-plaats" onClick={() => setFase('klaar')}>
              Nog eens
            </button>
          </div>
        ) : (
          <div className="vk-loop-knoppen">
            <button onPointerDown={() => tik('l')} aria-label="Linkervoet">
              🦶 L
            </button>
            <button onPointerDown={() => tik('r')} aria-label="Rechtervoet">
              R 🦶
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/** Doelworp: een doel schuift heen en weer; tik waar je wil werpen. Midden in het doel = 2 punten. */
export function Doelworp({ open, onSluit, onKlaar, kleur }: { open: boolean; onSluit: () => void; onKlaar: (score: number) => void; kleur: string }) {
  const doek = useRef<HTMLCanvasElement>(null)
  const [fase, setFase] = useState<'klaar' | 'spelen' | 'gedaan'>('klaar')
  const [score, setScore] = useState(0)
  const [tijd, setTijd] = useState(WORP_S)
  const s = useRef({ ballen: [] as { x: number; y: number; vx: number; vy: number; klaar: boolean }[], score: 0, start: 0, flits: [] as { x: number; y: number; t: number; tekst: string }[] })
  const W = 600
  const H = 800

  useEffect(() => {
    if (open) {
      setFase('klaar')
      setScore(0)
      setTijd(WORP_S)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const c = doek.current
    if (!c) return
    const g = c.getContext('2d')!
    let raf = 0
    let vorig = performance.now()
    const lus = (nu: number) => {
      const dt = Math.min(0.05, (nu - vorig) / 1000)
      vorig = nu
      const r = s.current
      const speel = fase === 'spelen'
      const verstreken = speel ? (nu - r.start) / 1000 : 0
      // Het doel: schuift sneller naarmate de tijd loopt.
      const dx = W / 2 + Math.sin(nu / 1000 * (1.1 + verstreken * 0.05)) * (W / 2 - 90)
      const dy = 170
      const db = 120
      g.fillStyle = '#0b1220'
      g.fillRect(0, 0, W, H)
      // Een stukje zaal: lijnen op de vloer.
      g.strokeStyle = 'rgba(255,255,255,.12)'
      g.lineWidth = 4
      for (let y = 300; y < H; y += 120) {
        g.beginPath()
        g.moveTo(0, y)
        g.lineTo(W, y)
        g.stroke()
      }
      // Het doel (krachtbal: een vak waar de bal in moet).
      g.fillStyle = 'rgba(56,189,248,.25)'
      g.fillRect(dx - db / 2, dy - 40, db, 80)
      g.strokeStyle = '#38bdf8'
      g.strokeRect(dx - db / 2, dy - 40, db, 80)
      g.fillStyle = 'rgba(250,204,21,.5)'
      g.fillRect(dx - 18, dy - 40, 36, 80)
      // De ballen.
      for (const b of r.ballen) {
        if (b.klaar) continue
        b.x += b.vx * dt
        b.y += b.vy * dt
        const sch = 0.5 + (b.y / H) * 0.5
        if (b.y <= dy) {
          b.klaar = true
          const naast = Math.abs(b.x - dx)
          const punten = naast < 22 ? 2 : naast < db / 2 + 10 ? 1 : 0
          if (speel && punten) {
            r.score = Math.min(99, r.score + punten)
            setScore(r.score)
            if ('vibrate' in navigator) navigator.vibrate?.(20)
          }
          r.flits.push({ x: b.x, y: dy - 50, t: nu, tekst: punten === 2 ? '+2 RAAK!' : punten ? '+1' : 'mis' })
        }
        g.fillStyle = kleur
        g.beginPath()
        g.arc(b.x, b.y, 22 * sch, 0, Math.PI * 2)
        g.fill()
        g.strokeStyle = '#78350f'
        g.lineWidth = 3
        g.stroke()
      }
      r.ballen = r.ballen.filter((b) => !b.klaar)
      r.flits = r.flits.filter((f) => nu - f.t < 700)
      g.textAlign = 'center'
      g.font = '900 34px Inter, system-ui, sans-serif'
      for (const f of r.flits) {
        g.globalAlpha = 1 - (nu - f.t) / 700
        g.fillStyle = f.tekst === 'mis' ? '#f87171' : '#fde047'
        g.fillText(f.tekst, f.x, f.y - (nu - f.t) / 20)
      }
      g.globalAlpha = 1
      // Je hand met de volgende bal.
      g.fillStyle = kleur
      g.beginPath()
      g.arc(W / 2, H - 70, 26, 0, Math.PI * 2)
      g.fill()
      if (speel) {
        const over = WORP_S - verstreken
        setTijd(Math.max(0, over))
        if (over <= 0) {
          setFase('gedaan')
          onKlaar(r.score)
          return
        }
      } else if (fase === 'klaar') {
        g.fillStyle = '#fff'
        g.font = '900 40px Inter, system-ui, sans-serif'
        g.fillText('Tik om te werpen!', W / 2, H / 2)
        g.font = '600 24px Inter, system-ui, sans-serif'
        g.fillStyle = '#94a3b8'
        g.fillText('Midden in het doel = 2 punten', W / 2, H / 2 + 44)
      }
      raf = requestAnimationFrame(lus)
    }
    raf = requestAnimationFrame(lus)
    return () => cancelAnimationFrame(raf)
  }, [open, fase, kleur, onKlaar])

  const werp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = s.current
    if (fase === 'gedaan') return
    if (fase === 'klaar') {
      r.score = 0
      r.ballen = []
      r.start = performance.now()
      setScore(0)
      setFase('spelen')
    }
    if (r.ballen.length >= 3) return
    const rect = e.currentTarget.getBoundingClientRect()
    const tx = ((e.clientX - rect.left) / rect.width) * W
    const ty = Math.min(H - 200, ((e.clientY - rect.top) / rect.height) * H)
    const sx = W / 2
    const sy = H - 70
    const l = Math.hypot(tx - sx, ty - sy) || 1
    r.ballen.push({ x: sx, y: sy, vx: ((tx - sx) / l) * 1100, vy: ((ty - sy) / l) * 1100, klaar: false })
  }

  if (!open) return null
  return (
    <div className="vk-spel" role="dialog" aria-label="Doelworp">
      <div className="vk-graf-kop">
        <div>
          <b>🎮 Doelworp</b>
          <span>
            Score {score} · {tijd.toFixed(0)} s
          </span>
        </div>
        <button className="vk-graf-sluit" onClick={onSluit} aria-label="Sluiten">
          ✕
        </button>
      </div>
      <div className="vk-spel-inhoud vk-worp">
        <canvas ref={doek} width={W} height={H} onPointerDown={werp} />
        {fase === 'gedaan' && (
          <div className="vk-spel-einde over">
            <b>🏆 {score} punten!</b>
            <span>Je score staat op het bord in de gameroom.</span>
            <button className="vk-graf-plaats" onClick={() => setFase('klaar')}>
              Nog eens
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
