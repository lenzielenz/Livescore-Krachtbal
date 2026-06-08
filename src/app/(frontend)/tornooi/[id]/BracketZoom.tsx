'use client'

import { useEffect, useRef, useState } from 'react'

// Inzoombaar overzicht voor de beker-boom: standaard schaalt de hele boom tot hij op de breedte
// past (overzicht in één blik). Een knop wisselt naar 1× (werkelijke grootte) met horizontaal
// scrollen om op een deel in te zoomen. Past zichzelf aan bij draaien/resizen.
export function BracketZoom({ children }: { children: React.ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(true)
  const [scale, setScale] = useState(1)
  const [innerH, setInnerH] = useState(0)
  const [overflows, setOverflows] = useState(false)

  useEffect(() => {
    const measure = () => {
      const wrap = wrapRef.current
      const inner = innerRef.current
      if (!wrap || !inner) return
      const w = wrap.clientWidth
      const iw = inner.scrollWidth
      const ih = inner.scrollHeight
      setScale(iw > w ? w / iw : 1)
      setInnerH(ih)
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

  // Enkel schalen als de boom breder is dan het scherm én de gebruiker in "overzicht" staat.
  const fitActive = fit && overflows

  return (
    <div className="trn-zoom-root">
      {overflows && (
        <button type="button" className="trn-zoom-btn" onClick={() => setFit((f) => !f)}>
          {fitActive ? '🔍 Inzoomen' : '⤢ Overzicht'}
        </button>
      )}
      <div
        className="trn-zoom"
        ref={wrapRef}
        style={fitActive ? { overflow: 'hidden', height: Math.ceil(innerH * scale) } : { overflowX: 'auto' }}
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
