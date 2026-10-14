'use client'

import { useEffect, useRef, useState } from 'react'

import { beginOpstelling, leesTactiek, STIFT, tekenTactiekbord, veldOpBord, type Stiftlijn, type Tactiek } from '@/lib/virtueel-tactiek'

// Het tactiekbord uit de kleedkamer, groot op je scherm: sleep de magneetjes (wij, zij en de bal)
// en teken looplijnen met de stift. Het bord onthoudt je opstelling op dit toestel, en wat je hier
// doet, verschijnt meteen op het whiteboard in de 3D-kleedkamer.

const OPSLAG = 'vk-tactiek'
const W = 1000
const H = 625

export function laadTactiek(): Tactiek {
  try {
    const ruw = window.localStorage.getItem(OPSLAG)
    return ruw ? leesTactiek(JSON.parse(ruw)) : beginOpstelling()
  } catch {
    return beginOpstelling()
  }
}

type Props = {
  open: boolean
  onSluit: () => void
  kleur: { wij: string; tekstWij: string }
  onWijzig: (t: Tactiek) => void
}

export function Tactiekbord({ open, onSluit, kleur, onWijzig }: Props) {
  const doek = useRef<HTMLCanvasElement>(null)
  const [t, setT] = useState<Tactiek>(() => beginOpstelling())
  const [stift, setStift] = useState<Stiftlijn['kleur'] | null>(null)
  const sleep = useRef<{ id: string } | { lijn: Stiftlijn } | null>(null)
  const tRef = useRef(t)
  tRef.current = t

  useEffect(() => {
    if (open) setT(laadTactiek())
  }, [open])

  useEffect(() => {
    const c = doek.current
    if (!c || !open) return
    tekenTactiekbord(c.getContext('2d')!, W, H, t, kleur)
  }, [t, open, kleur])

  const bewaar = (n: Tactiek) => {
    setT(n)
    onWijzig(n)
    try {
      window.localStorage.setItem(OPSLAG, JSON.stringify(n))
    } catch {
      // Geen opslag (privévenster): het bord werkt nog, het vergeet het enkel.
    }
  }

  const opVeld = (e: React.PointerEvent) => {
    const r = doek.current!.getBoundingClientRect()
    const v = veldOpBord(W, H)
    const bx = ((e.clientX - r.left) / r.width) * W
    const by = ((e.clientY - r.top) / r.height) * H
    return { x: Math.min(1, Math.max(0, (bx - v.x) / v.w)), y: Math.min(1, Math.max(0, (by - v.y) / v.h)), straal: (0.06 * Math.min(W, H)) / v.w }
  }
  const neer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = opVeld(e)
    // Een magneet raak je makkelijker dan je denkt: we nemen de dichtstbijzijnde binnen bereik.
    const v = veldOpBord(W, H)
    let beste: { id: string; d: number } | null = null
    for (const m of tRef.current.magneten) {
      const d = Math.hypot((m.x - p.x) * v.w, (m.y - p.y) * v.h)
      if (d < Math.min(W, H) * 0.075 && (!beste || d < beste.d)) beste = { id: m.id, d }
    }
    if (beste && !stift) {
      sleep.current = { id: beste.id }
      if ('vibrate' in navigator) navigator.vibrate?.(10)
      return
    }
    if (stift) {
      const lijn: Stiftlijn = { kleur: stift, p: [p.x, p.y] }
      sleep.current = { lijn }
      setT({ ...tRef.current, lijnen: [...tRef.current.lijnen, lijn] })
    } else if (beste) sleep.current = { id: beste.id }
  }
  const beweeg = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sleep.current
    if (!s) return
    const p = opVeld(e)
    const huidig = tRef.current
    if ('id' in s) setT({ ...huidig, magneten: huidig.magneten.map((m) => (m.id === s.id ? { ...m, x: p.x, y: p.y } : m)) })
    else {
      const l = s.lijn.p
      if (Math.hypot(p.x - l[l.length - 2], p.y - l[l.length - 1]) < 0.006) return
      s.lijn.p = [...l, Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000]
      setT({ ...huidig, lijnen: huidig.lijnen.map((x) => (x === s.lijn || x.p === l ? s.lijn : x)) })
    }
  }
  const op = () => {
    if (!sleep.current) return
    sleep.current = null
    const huidig = tRef.current
    bewaar({ ...huidig, lijnen: huidig.lijnen.filter((l) => l.p.length >= 4) })
  }

  if (!open) return null
  return (
    <div className="vk-tactiek" role="dialog" aria-label="Tactiekbord">
      <div className="vk-graf-kop">
        <div>
          <b>📋 Tactiekbord</b>
          <span>Sleep de magneetjes · teken je looplijnen</span>
        </div>
        <button className="vk-graf-sluit" onClick={onSluit} aria-label="Sluiten">
          ✕
        </button>
      </div>
      <div className="vk-tactiek-bord">
        <canvas ref={doek} width={W} height={H} onPointerDown={neer} onPointerMove={beweeg} onPointerUp={op} onPointerCancel={op} />
      </div>
      <div className="vk-graf-rij vk-tactiek-tools">
        <div className="vk-graf-groep">
          <button className={!stift ? 'actief' : ''} onClick={() => setStift(null)}>
            🧲 Magneten
          </button>
          {(Object.keys(STIFT) as Stiftlijn['kleur'][]).map((k) => (
            <button key={k} className={stift === k ? 'actief' : ''} onClick={() => setStift(k)} aria-label={`Stift ${k}`}>
              <span className="vk-stift" style={{ background: STIFT[k] }} />
            </button>
          ))}
        </div>
        <div className="vk-graf-groep">
          <button onClick={() => bewaar({ ...t, lijnen: t.lijnen.slice(0, -1) })} disabled={!t.lijnen.length} aria-label="Laatste lijn weg">
            ↶
          </button>
          <button onClick={() => bewaar({ ...t, lijnen: [] })} disabled={!t.lijnen.length}>
            Uitvegen
          </button>
          <button onClick={() => bewaar(beginOpstelling())}>Opnieuw</button>
        </div>
      </div>
    </div>
  )
}
