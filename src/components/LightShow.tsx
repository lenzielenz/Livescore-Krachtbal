'use client'

import { useEffect, useRef } from 'react'

import './lightshow.css'

// Digitale tifo / lichtshow: alle telefoons in de tribune vormen samen één gesynchroniseerd
// lichtscherm. De timing komt uit één gedeeld starttijdstip (`at`), zodat alle schermen gelijklopen.
// High-end: vloeiende gradient-choreografie, traveling waves (per-toestel fase), unisono-flitsen als
// duidelijk sync-bewijs, en een voortgangsbalk. Elk toestel kleurt in de eigen clubkleur.

type RGB = [number, number, number]
const SHOW_SECONDS = 22

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '').trim()
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(v.slice(0, 6) || 'ffffff', 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
const shade = (c: RGB, f: number): RGB => [cl(c[0] * f), cl(c[1] * f), cl(c[2] * f)]
const mix = (a: RGB, b: RGB, t: number): RGB => {
  const k = Math.max(0, Math.min(1, t))
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
}
const rgb = (c: RGB) => `rgb(${cl(c[0])},${cl(c[1])},${cl(c[2])})`
const radial = (cx: number, cy: number, inner: RGB, outer: RGB) =>
  `radial-gradient(130% 130% at ${cx.toFixed(1)}% ${cy.toFixed(1)}%, ${rgb(inner)}, ${rgb(outer)})`

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
  mine: string | null
  home: string
  away: string
  onDone: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const bloomRef = useRef<HTMLDivElement>(null)
  const seed = useRef(Math.random())
  const camp = useRef(Math.random() < 0.5)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  // Echt volledig scherm (verbergt de browserbalken) op het toestel dat de show start.
  useEffect(() => {
    const el = ref.current
    el?.requestFullscreen?.().catch(() => {})
    return () => {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    }
  }, [])

  // De terug-knop (Android) sluit de show i.p.v. weg te navigeren van de wedstrijdpagina.
  useEffect(() => {
    window.history.pushState({ overlay: 'lightshow' }, '')
    let viaPop = false
    const onPop = () => {
      viaPop = true
      onDoneRef.current()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      // Gesloten via tik/auto → ruim de extra history-entry op zodat 'terug' op de match blijft.
      if (!viaPop && window.history.state?.overlay === 'lightshow') window.history.back()
    }
  }, [])

  useEffect(() => {
    const WHITE: RGB = [255, 255, 255]
    const GOLD: RGB = [255, 209, 102]
    const NIGHT: RGB = [4, 10, 16]
    const MY = hexToRgb(mine || (camp.current ? home || '#0fe0a6' : away || '#4cc9f0'))
    const BRIGHT = shade(MY, 1.7)
    const DEEP = shade(MY, 0.28)
    const ph = seed.current
    const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

    let raf = 0
    const render = () => {
      const el = ref.current
      if (!el) return
      const ms = Date.now() - at
      const t = ms / 1000
      let bg: string
      let label = ''
      let bloom = 0

      if (ms < 0) {
        const left = Math.ceil(-ms / 1000)
        const breathe = (Math.sin(Date.now() / 500) + 1) / 2
        bg = radial(50, 42, mix(DEEP, MY, 0.25 + breathe * 0.2), NIGHT)
        label = `✨ LICHTSHOW ✨\nSamen op elk toestel\n${left}`
        bloom = breathe * 0.12
      } else if (t < 4) {
        // UNISONO-FLITS — alle schermen flitsen tegelijk wit (duidelijkste sync-bewijs).
        const f = Math.pow((Math.sin(t * 9) + 1) / 2, 2)
        bg = radial(50, 40, mix(MY, WHITE, f), mix(DEEP, MY, f))
        label = '✨ SAMEN ✨'
        bloom = f
      } else if (t < 9) {
        // TRAVELING WAVE — per toestel verschoven, samen golft de kleur door de tribune.
        const local = t * 1.6 - ph * Math.PI * 2
        const w = (Math.sin(local) + 1) / 2
        const cx = 50 + 46 * Math.sin(t * 0.7 + ph * 6.28)
        bg = radial(cx, 50, mix(DEEP, BRIGHT, ease(w)), DEEP)
      } else if (t < 13) {
        // SCHITTERING — elk toestel knippert op z'n eigen ritme (sterrenhemel).
        const on = Math.pow((Math.sin((t + ph * 6.28) * 7) + 1) / 2, 3)
        bg = radial(50, 45, mix(NIGHT, mix(MY, WHITE, 0.3), on), NIGHT)
      } else if (t < 17) {
        // UNISONO-PULS — volle clubkleur, samen ademend.
        const p = (Math.sin(t * 2.2) + 1) / 2
        bg = radial(50, 40, mix(MY, BRIGHT, p * 0.6), mix(DEEP, MY, p))
      } else if (t < 20) {
        // FINALE — opbouwende unisono-stroboscoop.
        const ramp = (t - 17) / 3
        const f = (Math.sin(t * (10 + ramp * 16)) + 1) / 2
        bg = radial(50, 45, mix(MY, WHITE, f), mix(MY, DEEP, 1 - f))
        bloom = f * (0.4 + ramp * 0.6)
        if (ramp > 0.4) label = '🎉'
      } else {
        // GOUDEN SLOT — flits en uitdoven.
        const k = Math.max(0, 1 - (t - 20) / 2)
        bg = radial(50, 42, mix(NIGHT, GOLD, k), NIGHT)
        bloom = k * 0.5
        if (k > 0.15) label = 'BEDANKT! 👏'
      }

      el.style.background = bg
      if (labelRef.current) labelRef.current.textContent = label
      if (barRef.current) barRef.current.style.transform = `scaleX(${Math.max(0, Math.min(1, t / SHOW_SECONDS))})`
      if (bloomRef.current) bloomRef.current.style.opacity = String(Math.max(0, Math.min(1, bloom)))
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
      <div ref={bloomRef} className="lsw-bloom" aria-hidden />
      <div className="lsw-vignette" aria-hidden />
      <div ref={labelRef} className="lsw-label" />
      <div className="lsw-foot">
        <span className="lsw-dot" aria-hidden />
        synchroon op elk toestel
      </div>
      <div className="lsw-bar" aria-hidden>
        <div ref={barRef} className="lsw-bar-fill" />
      </div>
    </div>
  )
}
