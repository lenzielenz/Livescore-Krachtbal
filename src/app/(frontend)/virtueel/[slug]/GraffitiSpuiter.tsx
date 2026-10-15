'use client'

import { useEffect, useRef, useState } from 'react'

import { BUSSEN, MUUR_H, tekenMuurBasis, tekenStreek, type Gereedschap, type Streek, type Tag } from '@/lib/virtueel-graffiti'

// De spuitbus op je gsm: de hele graffitimuur van je club op je scherm, en jij spuit erbij.
// Zo moet het aanvoelen als echt spuiten:
//  • de verf bouwt op waar je je vinger houdt (hoe langer, hoe voller), met spatjes, en blijf je
//    even stilstaan, dan loopt er een druppel naar beneden;
//  • een sissend spuitgeluid en korte trillingen (op Android) zolang je spuit;
//  • met twee vingers schuif je langs de muur en zoom je in; ↶ maakt je laatste haal ongedaan.
// Pas bij "Op de muur!" gaat je tag naar de server; daarna staat hij er voor iedereen, voorgoed.

const PPM = 90
const DIKTES = [
  { naam: 'S', w: 0.07 },
  { naam: 'M', w: 0.15 },
  { naam: 'L', w: 0.3 },
]

type Props = {
  open: boolean
  onSluit: () => void
  tags: Tag[]
  lengte: number
  club: { naam: string; primair: string; secundair: string }
  ingelogd: boolean
  onGeplaatst: (tag: Tag, lengte: number) => void
  /** Welke muur: die bij de kleedkamer, of die in de speelhal in de kelder. */
  muur?: 'kleedkamer' | 'kelder'
}

type Gebaar = { streken: Streek[] }

export function GraffitiSpuiter({ open, onSluit, tags, lengte, club, ingelogd, onGeplaatst, muur: welkeMuur = 'kleedkamer' }: Props) {
  const podium = useRef<HTMLDivElement>(null)
  const scherm = useRef<HTMLCanvasElement>(null)
  const muur = useRef<HTMLCanvasElement | null>(null)
  const concept = useRef<HTMLCanvasElement | null>(null)
  const zicht = useRef({ s: 1, ox: 0, oy: 0 })
  const gebaren = useRef<Gebaar[]>([])
  const [aantal, setAantal] = useState(0)
  const [kleur, setKleur] = useState(club.primair)
  const [dikte, setDikte] = useState(DIKTES[1].w)
  const [gereedschap, setGereedschap] = useState<Exclude<Gereedschap, 'drup'>>('spuit')
  const [schuiven, setSchuiven] = useState(false)
  const [spuit, setSpuit] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [uitLogin, setUitLogin] = useState(!ingelogd)
  const [balk, setBalk] = useState({ links: 0, breed: 1 })
  const st = useRef({ kleur, dikte, gereedschap, schuiven })
  st.current = { kleur, dikte, gereedschap, schuiven }
  const bussen = [club.primair, club.secundair, ...BUSSEN.filter((b) => b.toLowerCase() !== club.primair.toLowerCase() && b.toLowerCase() !== club.secundair.toLowerCase())]

  // De muur (alle bestaande tags) één keer tekenen; je eigen haal komt op een apart conceptvel.
  useEffect(() => {
    if (!open) return
    const m = document.createElement('canvas')
    m.width = Math.round(lengte * PPM)
    m.height = Math.round(MUUR_H * PPM)
    const g = m.getContext('2d')!
    tekenMuurBasis(g, lengte, PPM, club)
    for (const t of tags) for (const s of t.streken) tekenStreek(g, s, PPM)
    muur.current = m
    const c = document.createElement('canvas')
    c.width = m.width
    c.height = m.height
    concept.current = c
    gebaren.current = []
    setAantal(0)
    setFout(null)
    // Begin ingezoomd op de hoogte van de muur, aan het einde waar het nog leeg is.
    const el = podium.current
    if (el) {
      const s = el.clientHeight / m.height
      const laatsteX = tags.length ? Math.max(...tags.flatMap((t) => t.streken.flatMap((st2) => st2.p.filter((_, i) => i % 2 === 0)))) : 0
      zicht.current = { s, ox: Math.min(0, Math.max(el.clientWidth - m.width * s, -(laatsteX * PPM * s - el.clientWidth * 0.3))), oy: 0 }
    }
    teken()
  }, [open])

  const teken = () => {
    const c = scherm.current
    const el = podium.current
    const m = muur.current
    if (!c || !el || !m) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    if (c.width !== Math.round(el.clientWidth * dpr) || c.height !== Math.round(el.clientHeight * dpr)) {
      c.width = Math.round(el.clientWidth * dpr)
      c.height = Math.round(el.clientHeight * dpr)
    }
    const g = c.getContext('2d')!
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.fillStyle = '#0b0f17'
    g.fillRect(0, 0, c.width, c.height)
    const { s, ox, oy } = zicht.current
    g.setTransform(s * dpr, 0, 0, s * dpr, ox * dpr, oy * dpr)
    g.imageSmoothingEnabled = true
    g.drawImage(m, 0, 0)
    if (concept.current) g.drawImage(concept.current, 0, 0)
    const breed = Math.min(1, el.clientWidth / (m.width * s))
    setBalk({ links: Math.max(0, Math.min(1 - breed, -ox / (m.width * s))), breed })
  }

  const begrens = () => {
    const el = podium.current
    const m = muur.current
    if (!el || !m) return
    const z = zicht.current
    const min = Math.min(el.clientHeight / m.height, el.clientWidth / m.width)
    z.s = Math.max(min * 0.9, Math.min((el.clientHeight / m.height) * 4, z.s))
    const w = m.width * z.s
    const h = m.height * z.s
    z.ox = w <= el.clientWidth ? (el.clientWidth - w) / 2 : Math.min(0, Math.max(el.clientWidth - w, z.ox))
    z.oy = h <= el.clientHeight ? (el.clientHeight - h) / 2 : Math.min(0, Math.max(el.clientHeight - h, z.oy))
  }

  // ---------- geluid en trillen ----------
  const audio = useRef<{ ctx: AudioContext; gain: GainNode } | null>(null)
  const startGeluid = () => {
    try {
      if (!audio.current) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const ctx = new AC()
        const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
        const d = buf.getChannelData(0)
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
        const bron = ctx.createBufferSource()
        bron.buffer = buf
        bron.loop = true
        const filter = ctx.createBiquadFilter()
        filter.type = 'bandpass'
        filter.frequency.value = 3800
        filter.Q.value = 0.7
        const gain = ctx.createGain()
        gain.gain.value = 0
        bron.connect(filter).connect(gain).connect(ctx.destination)
        bron.start()
        audio.current = { ctx, gain }
      }
      const { ctx, gain } = audio.current
      void ctx.resume()
      gain.gain.setTargetAtTime(st.current.gereedschap === 'spuit' ? 0.09 : 0.02, ctx.currentTime, 0.03)
    } catch {
      // Geen geluid mogelijk: spuiten kan nog altijd.
    }
  }
  const stopGeluid = () => {
    const a = audio.current
    if (a) a.gain.gain.setTargetAtTime(0, a.ctx.currentTime, 0.05)
  }
  useEffect(() => {
    if (!open) stopGeluid()
    return () => stopGeluid()
  }, [open])

  // ---------- spuiten, schuiven en zoomen ----------
  const wijzers = useRef(new Map<number, { x: number; y: number }>())
  const haal = useRef<{ streek: Streek; gebaar: Gebaar; laatst: { x: number; y: number }; drup: boolean; bewogen: boolean; sinds: number } | null>(null)
  const knijp = useRef<{ d: number; cx: number; cy: number } | null>(null)
  const naarMuur = (sx: number, sy: number) => {
    const { s, ox, oy } = zicht.current
    return { x: (sx - ox) / s / PPM, y: MUUR_H - (sy - oy) / s / PPM }
  }
  const tekenStuk = (s: Streek, p: number[], vervolg = false) => {
    const g = concept.current?.getContext('2d')
    if (g) tekenStreek(g, { ...s, p }, PPM, 0, vervolg)
  }
  const punt = (x: number, y: number) => {
    const h = haal.current
    if (!h) return
    const p = h.streek.p
    const vorig = p.slice(-2)
    p.push(Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000)
    tekenStuk(h.streek, [...vorig, x, y], true)
  }
  useEffect(() => {
    if (!spuit) return
    let laatsteTril = 0
    const id = window.setInterval(() => {
      const h = haal.current
      if (!h) return
      // Blijven staan = meer verf op dezelfde plek; na een tijdje loopt er een druppel.
      // (Beweeg je, dan legt het slepen zelf de verf; anders zou de lijn parelsnoeren krijgen.)
      if (h.streek.t === 'spuit' && h.bewogen) h.bewogen = false
      else if (h.streek.t === 'spuit') {
        punt(h.laatst.x, h.laatst.y)
        if (performance.now() - h.sinds > 700 && !h.drup) {
          h.drup = true
          const lengte = 0.12 + Math.random() * 0.35
          const drup: Streek = { t: 'drup', k: h.streek.k, w: h.streek.w, p: [h.laatst.x, h.laatst.y - h.streek.w * 0.3, h.laatst.x, Math.max(0.02, h.laatst.y - h.streek.w * 0.3 - lengte)] }
          h.gebaar.streken.push(drup)
          tekenStuk(drup, drup.p)
        }
      }
      teken()
      const nu = performance.now()
      if (nu - laatsteTril > 90 && 'vibrate' in navigator) {
        laatsteTril = nu
        navigator.vibrate?.(8)
      }
    }, 45)
    return () => window.clearInterval(id)
  }, [spuit])

  const plek = (e: React.PointerEvent) => {
    const r = podium.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const neer = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    wijzers.current.set(e.pointerId, plek(e))
    if (wijzers.current.size >= 2) {
      // Tweede vinger: geen spuithaal maar schuiven/zoomen (een begonnen haal vervalt).
      if (haal.current) {
        gebaren.current = gebaren.current.filter((g) => g !== haal.current?.gebaar)
        hertekenConcept()
        haal.current = null
        setSpuit(false)
        stopGeluid()
      }
      const [a, b] = [...wijzers.current.values()]
      knijp.current = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }
      return
    }
    if (st.current.schuiven || uitLogin || e.button === 2) return
    const p = plek(e)
    const m = naarMuur(p.x, p.y)
    const streek: Streek = { t: st.current.gereedschap, k: st.current.kleur, w: st.current.dikte, p: [Math.round(m.x * 1000) / 1000, Math.round(m.y * 1000) / 1000] }
    const gebaar: Gebaar = { streken: [streek] }
    gebaren.current.push(gebaar)
    haal.current = { streek, gebaar, laatst: m, drup: false, bewogen: false, sinds: performance.now() }
    tekenStuk(streek, streek.p)
    setAantal(gebaren.current.length)
    setSpuit(true)
    startGeluid()
    teken()
  }
  const beweeg = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!wijzers.current.has(e.pointerId)) return
    const p = plek(e)
    const vorige = wijzers.current.get(e.pointerId)!
    wijzers.current.set(e.pointerId, p)
    const z = zicht.current
    if (wijzers.current.size >= 2 && knijp.current) {
      const [a, b] = [...wijzers.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      const cx = (a.x + b.x) / 2
      const cy = (a.y + b.y) / 2
      const f = d / Math.max(1, knijp.current.d)
      const s0 = z.s
      z.s *= f
      begrens()
      const echt = z.s / s0
      z.ox = cx - (knijp.current.cx - z.ox) * echt + (cx - knijp.current.cx) * 0
      z.oy = cy - (knijp.current.cy - z.oy) * echt
      z.ox += cx - knijp.current.cx
      z.oy += cy - knijp.current.cy
      knijp.current = { d, cx, cy }
      begrens()
      teken()
      return
    }
    if (st.current.schuiven || !haal.current) {
      if (st.current.schuiven) {
        z.ox += p.x - vorige.x
        z.oy += p.y - vorige.y
        begrens()
        teken()
      }
      return
    }
    const m = naarMuur(p.x, p.y)
    const h = haal.current
    if (Math.hypot(m.x - h.laatst.x, m.y - h.laatst.y) > 0.03) {
      h.sinds = performance.now()
      h.drup = false
      h.bewogen = true
    }
    h.laatst = m
    punt(m.x, m.y)
    teken()
  }
  const op = (e: React.PointerEvent<HTMLDivElement>) => {
    wijzers.current.delete(e.pointerId)
    if (wijzers.current.size < 2) knijp.current = null
    if (haal.current && wijzers.current.size === 0) {
      haal.current = null
      setSpuit(false)
      stopGeluid()
    }
  }
  const wiel = (e: React.WheelEvent) => {
    const z = zicht.current
    if (e.ctrlKey) {
      const f = Math.exp(-e.deltaY * 0.01)
      const r = podium.current!.getBoundingClientRect()
      const cx = e.clientX - r.left
      const s0 = z.s
      z.s *= f
      begrens()
      z.ox = cx - (cx - z.ox) * (z.s / s0)
    } else z.ox -= e.deltaX || e.deltaY
    begrens()
    teken()
  }

  const hertekenConcept = () => {
    const c = concept.current
    if (!c) return
    const g = c.getContext('2d')!
    g.clearRect(0, 0, c.width, c.height)
    for (const gb of gebaren.current) for (const s of gb.streken) tekenStreek(g, s, PPM)
    teken()
  }
  const ongedaan = () => {
    gebaren.current.pop()
    setAantal(gebaren.current.length)
    hertekenConcept()
  }
  const wis = () => {
    gebaren.current = []
    setAantal(0)
    hertekenConcept()
  }
  const plaats = async () => {
    const streken = gebaren.current.flatMap((g) => g.streken).filter((s) => s.p.length >= 2)
    if (!streken.length) return
    setBezig(true)
    setFout(null)
    try {
      const r = await fetch('/api/virtueel/graffiti', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ streken, muur: welkeMuur }) })
      const data = (await r.json().catch(() => ({}))) as { tag?: Tag; lengte?: number; error?: string }
      if (r.status === 401) {
        setUitLogin(true)
        return
      }
      if (!r.ok || !data.tag) {
        setFout(data.error ?? 'Dat lukte niet. Probeer het straks opnieuw.')
        return
      }
      if ('vibrate' in navigator) navigator.vibrate?.([30, 40, 60])
      onGeplaatst(data.tag, data.lengte ?? lengte)
      gebaren.current = []
      setAantal(0)
      onSluit()
    } catch {
      setFout('Geen verbinding. Probeer het straks opnieuw.')
    } finally {
      setBezig(false)
    }
  }

  useEffect(() => {
    if (!open) return
    const ro = new ResizeObserver(() => {
      begrens()
      teken()
    })
    if (podium.current) ro.observe(podium.current)
    return () => ro.disconnect()
  }, [open])

  if (!open) return null
  return (
    <div className="vk-graf" role="dialog" aria-label="Graffitimuur">
      <div className="vk-graf-kop">
        <div>
          <b>🎨 Graffitimuur</b>
          <span>{club.naam} · iedereen spuit mee, je tag blijft staan</span>
        </div>
        <button className="vk-graf-sluit" onClick={onSluit} aria-label="Sluiten">
          ✕
        </button>
      </div>
      <div
        className={`vk-graf-podium${schuiven ? ' schuiven' : ''}`}
        ref={podium}
        onPointerDown={neer}
        onPointerMove={beweeg}
        onPointerUp={op}
        onPointerCancel={op}
        onWheel={wiel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <canvas ref={scherm} />
        <div className="vk-graf-balk" aria-hidden>
          <span style={{ left: `${balk.links * 100}%`, width: `${balk.breed * 100}%` }} />
        </div>
        {uitLogin && (
          <div className="vk-graf-login">
            <b>Log in om mee te spuiten</b>
            <span>Je tag blijft voorgoed op de muur van je club staan.</span>
            <a href={`/inloggen?next=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '/virtueel')}`} className="btn btn-primary">
              Inloggen
            </a>
            <button className="vk-graf-oefen" onClick={() => setUitLogin(false)}>
              Eerst wat oefenen
            </button>
          </div>
        )}
      </div>
      <div className="vk-graf-tools">
        <div className="vk-graf-bussen">
          {bussen.map((b) => (
            <button
              key={b}
              className={`vk-graf-bus${b === kleur ? ' actief' : ''}${b === kleur && spuit ? ' schud' : ''}`}
              style={{ ['--bus' as string]: b }}
              onClick={() => {
                setKleur(b)
                setSchuiven(false)
              }}
              aria-label={`Kleur ${b}`}
            />
          ))}
        </div>
        <div className="vk-graf-rij">
          <div className="vk-graf-groep">
            <button className={gereedschap === 'spuit' && !schuiven ? 'actief' : ''} onClick={() => (setGereedschap('spuit'), setSchuiven(false))}>
              🎨 Spuitbus
            </button>
            <button className={gereedschap === 'stift' && !schuiven ? 'actief' : ''} onClick={() => (setGereedschap('stift'), setSchuiven(false))}>
              🖊️ Stift
            </button>
            <button className={schuiven ? 'actief' : ''} onClick={() => setSchuiven((x) => !x)} aria-label="Schuiven">
              ✋
            </button>
          </div>
          <div className="vk-graf-groep">
            {DIKTES.map((d) => (
              <button key={d.naam} className={dikte === d.w ? 'actief' : ''} onClick={() => setDikte(d.w)}>
                {d.naam}
              </button>
            ))}
          </div>
          <div className="vk-graf-groep">
            <button onClick={ongedaan} disabled={!aantal} aria-label="Ongedaan maken">
              ↶
            </button>
            <button onClick={wis} disabled={!aantal} aria-label="Alles wissen">
              🗑
            </button>
          </div>
          <button className="vk-graf-plaats" onClick={plaats} disabled={!aantal || bezig}>
            {bezig ? 'Even drogen…' : 'Op de muur!'}
          </button>
        </div>
        {fout && <p className="vk-graf-fout">{fout}</p>}
        <p className="vk-graf-tip">Houd je vinger stil voor een druppel · twee vingers om te schuiven en te zoomen</p>
      </div>
    </div>
  )
}
