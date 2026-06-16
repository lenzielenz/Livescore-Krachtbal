'use client'

import { useEffect, useRef } from 'react'

import './lightshow.css'

// Digitale tifo / lichtshow: alle telefoons in de tribune vormen samen één gesynchroniseerd
// lichtscherm. Eén toestel is niks; met velen samen wordt het een zee van kleur. De timing komt
// uit één gedeeld starttijdstip (`at`) via het live-kanaal, zodat alle schermen gelijklopen.
// Per toestel een vaste willekeurige "fase" → de tribune schittert/golft i.p.v. exact gelijk.
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').trim()
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(v.slice(0, 6) || 'ffffff', 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const mix = (a: [number, number, number], b: [number, number, number], t: number): string =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)}, ${Math.round(a[1] + (b[1] - a[1]) * t)}, ${Math.round(a[2] + (b[2] - a[2]) * t)})`

export function LightShow({
  at,
  durationMs,
  mine,
  home,
  away,
  onDone,
}: {
  at: number
  durationMs: number
  // De clubkleur van de ingelogde supporter op dít toestel (zo kleurt elk toestel in zijn eigen
  // clubkleur → de tribune splitst vanzelf per club). Null = geen club → val terug op de matchkleuren.
  mine: string | null
  home: string
  away: string
  onDone: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  // Stabiele per-toestel waarden (deze telefoon = één tegel in de tifo).
  const seed = useRef(Math.random())
  const camp = useRef(Math.random() < 0.5) // enkel gebruikt als terugval (geen eigen club)

  useEffect(() => {
    const WHITE: [number, number, number] = [255, 255, 255]
    const GOLD: [number, number, number] = [255, 209, 102]
    const BLACK: [number, number, number] = [6, 20, 13]
    // Kleur van dit toestel = eigen clubkleur; anders een van de twee matchkleuren.
    const MY = hexToRgb(mine || (camp.current ? home || '#0fe0a6' : away || '#4cc9f0'))
    const ph = seed.current

    let raf = 0
    const render = () => {
      const el = ref.current
      if (!el) return
      const ms = Date.now() - at
      const t = ms / 1000
      let bg: string
      let label = ''

      if (ms < 0) {
        // Aftellen: houd je scherm omhoog.
        const left = Math.ceil(-ms / 1000)
        bg = mix(BLACK, MY, 0.18)
        label = `💡 Houd je scherm omhoog!\n${left}`
      } else if (t < 5) {
        // Fase 1 — PULS: heel de tribune pulseert samen, elk toestel in zijn eigen clubkleur.
        const pulse = (Math.sin(t * 2.4) + 1) / 2
        bg = mix(BLACK, MY, 0.3 + pulse * 0.7)
      } else if (t < 10) {
        // Fase 2 — SCHITTERING: elk toestel knippert op z'n eigen ritme (sterrenhemel in clubkleur).
        const on = (Math.sin((t + ph * 6.28) * 6) + 1) / 2
        bg = mix(BLACK, MY, on * on)
      } else if (t < 15) {
        // Fase 3 — FLITS: wissel tussen clubkleur en wit (gesynchroniseerd) voor een felle vibe.
        const cycle = Math.floor((t - 10) * 2) % 2
        const frac = ((t - 10) * 2) % 1
        bg = cycle === 0 ? mix(MY, WHITE, frac) : mix(WHITE, MY, frac)
      } else if (t < 18) {
        // Fase 4 — VOL: volle clubkleur, zacht pulserend.
        const pulse = (Math.sin(t * 3) + 1) / 2
        bg = mix(BLACK, MY, 0.55 + pulse * 0.45)
      } else {
        // Slot — gouden flits en uitdoven.
        const k = Math.max(0, 1 - (t - 18) / 3)
        bg = mix(BLACK, GOLD, k)
      }

      el.style.background = bg
      if (labelRef.current) labelRef.current.textContent = label
      raf = requestAnimationFrame(render)
    }
    raf = requestAnimationFrame(render)
    const stop = setTimeout(onDone, Math.max(0, at - Date.now()) + durationMs)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(stop)
    }
  }, [at, durationMs, mine, home, away, onDone])

  return (
    <div ref={ref} className="lsw" role="dialog" aria-label="Lichtshow" onClick={onDone}>
      <div ref={labelRef} className="lsw-label" />
    </div>
  )
}
