'use client'

import { useEffect, useRef, useState } from 'react'

// Inzoombaar overzicht voor de beker-boom: standaard past de hele boom op de breedte (overzicht).
// Tik op een wedstrijd → je zoomt naar 1× gecentreerd op die plek; tik nog eens (op een lege plek)
// → terug naar overzicht. Dynamisch en snel om door de boom te bewegen. Past zich aan bij resizen.
export function BracketZoom({ children }: { children: React.ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(true)
  const [scale, setScale] = useState(1)
  const [innerH, setInnerH] = useState(0)
  const [overflows, setOverflows] = useState(false)
  // Doelpunt (in ware grootte) om naar te centreren zodra we naar 1× schakelen.
  const pendingScroll = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const measure = () => {
      const wrap = wrapRef.current
      const inner = innerRef.current
      if (!wrap || !inner) return
      const w = wrap.clientWidth
      const iw = inner.scrollWidth
      setScale(iw > w ? w / iw : 1)
      setInnerH(inner.scrollHeight)
      setOverflows(iw > w + 1)
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (wrapRef.current) ro.observe(wrapRef.current)
    if (innerRef.current) ro.observe(innerRef.current)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  const fitActive = fit && overflows

  // Na het inzoomen (1×): scroll zodat het aangetikte punt gecentreerd staat.
  useEffect(() => {
    if (fit) return
    const wrap = wrapRef.current
    const ps = pendingScroll.current
    if (wrap && ps) {
      requestAnimationFrame(() => {
        wrap.scrollLeft = Math.max(0, ps.x - wrap.clientWidth / 2)
        wrap.scrollTop = Math.max(0, ps.y - wrap.clientHeight / 2)
        pendingScroll.current = null
      })
    }
  }, [fit])

  const onClick = (e: React.MouseEvent) => {
    if (!overflows) return
    if (fitActive) {
      // Overzicht → zoom in op het aangetikte punt (en onderdruk de mini-knoppen in de kaart).
      const inner = innerRef.current
      if (inner) {
        const rect = inner.getBoundingClientRect()
        pendingScroll.current = { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale }
      }
      e.preventDefault()
      e.stopPropagation()
      setFit(false)
    } else {
      // Ingezoomd → een tik op een lege plek (geen knop/link) gaat terug naar overzicht.
      const el = e.target as HTMLElement
      if (el.closest('a, button')) return
      setFit(true)
    }
  }

  return (
    <div className="trn-zoom-root">
      {overflows && (
        <button type="button" className="trn-zoom-btn" onClick={() => setFit((f) => !f)}>
          {fitActive ? '🔍 Inzoomen' : '⤢ Overzicht'}
        </button>
      )}
      <div
        className={`trn-zoom${overflows ? (fitActive ? ' is-fit' : ' is-zoom') : ''}`}
        ref={wrapRef}
        onClick={onClick}
        style={fitActive ? { overflow: 'hidden', height: Math.ceil(innerH * scale) } : { overflow: 'auto', maxHeight: '78vh' }}
      >
        <div
          className="trn-zoom-inner"
          ref={innerRef}
          style={fitActive ? { transform: `scale(${scale})`, transformOrigin: 'top left' } : undefined}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
