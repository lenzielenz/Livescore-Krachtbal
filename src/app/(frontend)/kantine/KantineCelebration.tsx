'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'

import { TeamLogo } from '@/components/TeamLogo'
import type { LogoFit } from '@/lib/logo-fit'
import { bezier, emojiDraaiing, INSLAG_MS, richting, stuurpunten, voortgang, type Punt } from '@/lib/raketvlucht'
import './kantine-viering.css'

// Schermvullende doelpunt-viering en fotoshow voor het kantinescherm — dezelfde spektakel-
// overlays als het tornooischerm (GroepKantine.tsx: VieringOverlay/FotoShow), hier herbouwd op de
// databronnen van de competitie (KantineBord/KantineLive) i.p.v. het tornooi-groepbord.

const VIERING_MS = 2400
// De rugworp vertelt meer: een lanceerflits, een vlucht over het hele scherm, een inslag en pas
// daarna de tekst. Zie raketvlucht.ts voor de tijdlijn.
const VIERING_RAKET_MS = 4400
const FOTO_TEL_VANAF = 3
const FOTO_TOON_MS = 6500
const FOTO_TOON_MAX_MS = 11000

/** Een doelpunt-viering: welke club scoorde, hoeveel punten, en tegen wie. */
export type Viering = {
  key: number
  kant: 'home' | 'away'
  team: string
  punten: number
  kleur: string | null
  logo: string | null
  fit: LogoFit | null
  reeks: string
  tegen: string
  tegenLogo: string | null
  tegenFit: LogoFit | null
  tegenKleur: string | null
}

/** Een rugworp (+2) toont een raketvlucht en mag daarom iets langer duren dan een nekworp. */
export const vieringDuur = (v: { punten: number }) => (v.punten === 2 ? VIERING_RAKET_MS : VIERING_MS)

export function GoalCelebrationOverlay({ v, ms }: { v: Viering; ms: number }) {
  if (v.punten === 2) return <RaketViering v={v} ms={ms} />
  return (
    <div className="ktc-viering" style={{ ...(v.kleur ? { '--vc': v.kleur } : {}), '--vdur': `${ms}ms` } as CSSProperties} aria-live="polite">
      <div className="ktc-viering-flits" aria-hidden />
      <div className="ktc-viering-golf" aria-hidden />
      <div className="ktc-viering-burst" aria-hidden />
      <div className="ktc-viering-inhoud">
        <span className="ktc-viering-logo draai">
          <TeamLogo name={v.team} logoUrl={v.logo} logoFit={v.fit} side="home" size="clamp(140px, 34vmin, 380px)" ringColor={v.kleur ?? undefined} />
        </span>
        <span className="ktc-viering-punten">+{v.punten}</span>
        <span className="ktc-viering-titel">DOELPUNT!</span>
        <span className="ktc-viering-team">{v.team}</span>
        <span className="ktc-viering-reeks">{v.reeks}</span>
      </div>
    </div>
  )
}

/**
 * Rugworp (+2): een raket stijgt op bij het logo van de scorende club, trekt een vuur- en
 * rookspoor in een grote S-bocht over het HELE scherm, en slaat in op het logo van de
 * tegenstander — explosie in de clubkleuren, schokgolf, het scherm trilt. Pas daarna verschijnt
 * "+2 DOELPUNT!".
 *
 * Thuis staat links, uit rechts — zoals op het bord. Scoort de uitploeg, dan vertrekt de raket
 * dus rechtsonder en slaat hij linksboven in.
 */
function RaketViering({ v, ms }: { v: Viering; ms: number }) {
  const vanRef = useRef<HTMLSpanElement>(null)
  const naarRef = useRef<HTMLSpanElement>(null)
  const [inslag, setInslag] = useState(false)
  const scorerLinks = v.kant === 'home'
  return (
    <div
      className={`ktc-viering raket vol${inslag ? ' inslag' : ''}`}
      style={{ ...(v.kleur ? { '--vc': v.kleur } : {}), '--vdur': `${ms}ms` } as CSSProperties}
      aria-live="polite"
    >
      <div className="ktc-viering-flits" aria-hidden />
      <div className="ktc-viering-burst" aria-hidden />
      <span ref={vanRef} className={`ktc-vlucht-af ${scorerLinks ? 'links' : 'rechts'}`}>
        <TeamLogo name={v.team} logoUrl={v.logo} logoFit={v.fit} side={v.kant} size="clamp(100px, 20vmin, 230px)" ringColor={v.kleur ?? undefined} />
      </span>
      <span ref={naarRef} className={`ktc-vlucht-doel ${scorerLinks ? 'rechts' : 'links'}`}>
        {inslag && (
          <span className="ktc-vlucht-boem" aria-hidden>
            💥
          </span>
        )}
        <span className="ktc-vlucht-doel-logo">
          <TeamLogo name={v.tegen} logoUrl={v.tegenLogo} logoFit={v.tegenFit} side={v.kant === 'home' ? 'away' : 'home'} size="clamp(100px, 20vmin, 230px)" ringColor={v.tegenKleur ?? undefined} />
        </span>
      </span>
      <RaketCanvas vanRef={vanRef} naarRef={naarRef} kleur={v.kleur} tegenKleur={v.tegenKleur} opInslag={() => setInslag(true)} />
      <div className="ktc-viering-inhoud ktc-vlucht-tekst">
        <span className="ktc-viering-punten">+2</span>
        <span className="ktc-viering-titel">RUGWORP!</span>
        <span className="ktc-viering-team">{v.team}</span>
        <span className="ktc-viering-reeks">{v.reeks}</span>
      </div>
    </div>
  )
}

type Deeltje = {
  x: number
  y: number
  vx: number
  vy: number
  leven: number
  duur: number
  r: number
  groei: number
  kleur: string
  soort: 'vuur' | 'rook' | 'vonk'
  zwaarte: number
}

const VUUR = ['#fff6c8', '#ffd166', '#ff9f43', '#ff5d2a']
const kies = <T,>(lijst: T[]) => lijst[Math.floor(Math.random() * lijst.length)]

/** Het canvas met de raket, het spoor en de inslag. Tekent zichzelf; zonder animatie-voorkeur niets. */
function RaketCanvas({
  vanRef,
  naarRef,
  kleur,
  tegenKleur,
  opInslag,
}: {
  vanRef: RefObject<HTMLSpanElement | null>
  naarRef: RefObject<HTMLSpanElement | null>
  kleur: string | null
  tegenKleur: string | null
  opInslag: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // De callback mag elke render wijzigen zonder de animatie te herstarten.
  const inslagRef = useRef(opInslag)
  inslagRef.current = opInslag

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    // Wie animaties uitzette, krijgt meteen de inslag en geen vlucht.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      inslagRef.current()
      return
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const B = window.innerWidth
    const H = window.innerHeight
    canvas.width = Math.round(B * dpr)
    canvas.height = Math.round(H * dpr)
    ctx.scale(dpr, dpr)

    const midden = (el: HTMLElement | null, terugval: Punt): Punt => {
      if (!el) return terugval
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }
    const p0 = midden(vanRef.current, { x: B * 0.15, y: H * 0.75 })
    const p3 = midden(naarRef.current, { x: B * 0.85, y: H * 0.25 })
    const [p1, p2] = stuurpunten(p0, p3, { b: B, h: H })
    const clubKleur = kleur || '#ff5d6c'
    const geraakt = tegenKleur || '#6fb2ff'
    const raketGrootte = Math.max(48, Math.min(120, Math.min(B, H) * 0.1))

    const deeltjes: Deeltje[] = []
    const voeg = (d: Omit<Deeltje, 'leven'>) => deeltjes.push({ ...d, leven: 0 })
    let ontploft = false
    let golven: { start: number }[] = []
    const t0 = performance.now()
    let vorige = t0
    let raf = 0

    // Lanceerflits: een wolk rook en vuur aan de voet van de raket.
    for (let i = 0; i < 40; i++) {
      const hoek = Math.random() * Math.PI * 2
      const snel = 0.05 + Math.random() * 0.25
      voeg({ x: p0.x, y: p0.y, vx: Math.cos(hoek) * snel, vy: Math.sin(hoek) * snel * 0.5, duur: 900 + Math.random() * 700, r: 10 + Math.random() * 18, groei: 0.04, kleur: 'rgba(200,205,215,0.5)', soort: 'rook', zwaarte: -0.00004 })
    }

    const teken = (nu: number) => {
      const el = nu - t0
      const dt = Math.min(48, nu - vorige)
      vorige = nu
      ctx.clearRect(0, 0, B, H)

      const t = voortgang(el)
      const vliegt = el >= 0 && t < 1
      const pos = bezier(p0, p1, p2, p3, t)
      const hoek = richting(p0, p1, p2, p3, Math.max(0.001, Math.min(0.999, t)))

      // Het spoor: vuur vlak achter de raket, rook die uitwaaiert, vonken in de clubkleur.
      if (vliegt && el > 120) {
        const achter = { x: pos.x - Math.cos(hoek) * raketGrootte * 0.45, y: pos.y - Math.sin(hoek) * raketGrootte * 0.45 }
        for (let i = 0; i < 5; i++) {
          const zij = (Math.random() - 0.5) * 0.9
          voeg({ x: achter.x, y: achter.y, vx: -Math.cos(hoek + zij) * 0.12, vy: -Math.sin(hoek + zij) * 0.12, duur: 260 + Math.random() * 240, r: raketGrootte * (0.16 + Math.random() * 0.14), groei: -0.02, kleur: kies(VUUR), soort: 'vuur', zwaarte: 0 })
        }
        for (let i = 0; i < 3; i++) {
          voeg({ x: achter.x, y: achter.y, vx: (Math.random() - 0.5) * 0.05, vy: (Math.random() - 0.5) * 0.05, duur: 1100 + Math.random() * 900, r: raketGrootte * 0.14, groei: 0.035, kleur: 'rgba(190,196,208,0.32)', soort: 'rook', zwaarte: -0.00003 })
        }
        if (Math.random() < 0.8) {
          const zij = (Math.random() - 0.5) * 1.6
          voeg({ x: achter.x, y: achter.y, vx: -Math.cos(hoek + zij) * (0.15 + Math.random() * 0.3), vy: -Math.sin(hoek + zij) * (0.15 + Math.random() * 0.3), duur: 500 + Math.random() * 500, r: 2 + Math.random() * 2.5, groei: 0, kleur: Math.random() < 0.6 ? clubKleur : '#ffffff', soort: 'vonk', zwaarte: 0.0006 })
        }
      }

      // De inslag: één keer, op het logo van de tegenstander.
      if (!ontploft && el >= INSLAG_MS) {
        ontploft = true
        inslagRef.current()
        golven = [{ start: nu }, { start: nu + 140 }, { start: nu + 300 }]
        for (let i = 0; i < 190; i++) {
          const a = Math.random() * Math.PI * 2
          const snel = 0.15 + Math.random() * 0.9
          voeg({ x: p3.x, y: p3.y, vx: Math.cos(a) * snel, vy: Math.sin(a) * snel, duur: 700 + Math.random() * 1100, r: 2 + Math.random() * 4, groei: 0, kleur: kies([clubKleur, clubKleur, '#ffffff', '#ffd166', geraakt]), soort: 'vonk', zwaarte: 0.0009 })
        }
        for (let i = 0; i < 26; i++) {
          const a = Math.random() * Math.PI * 2
          const snel = 0.05 + Math.random() * 0.22
          voeg({ x: p3.x, y: p3.y, vx: Math.cos(a) * snel, vy: Math.sin(a) * snel, duur: 500 + Math.random() * 400, r: 26 + Math.random() * 40, groei: -0.03, kleur: kies(VUUR), soort: 'vuur', zwaarte: 0 })
        }
        for (let i = 0; i < 30; i++) {
          const a = Math.random() * Math.PI * 2
          const snel = 0.03 + Math.random() * 0.12
          voeg({ x: p3.x, y: p3.y, vx: Math.cos(a) * snel, vy: Math.sin(a) * snel, duur: 1400 + Math.random() * 900, r: 24 + Math.random() * 30, groei: 0.05, kleur: 'rgba(120,124,134,0.35)', soort: 'rook', zwaarte: -0.00002 })
        }
      }

      // Deeltjes bijwerken en tekenen: rook eerst (gewone menging), dan vuur en vonken die oplichten.
      for (let i = deeltjes.length - 1; i >= 0; i--) {
        const d = deeltjes[i]
        d.leven += dt
        if (d.leven >= d.duur || d.r <= 0.2) {
          deeltjes.splice(i, 1)
          continue
        }
        d.vy += d.zwaarte * dt
        d.x += d.vx * dt
        d.y += d.vy * dt
        d.r = Math.max(0.2, d.r + d.groei * dt * 0.2)
      }
      for (const laag of ['rook', 'vuur', 'vonk'] as const) {
        ctx.globalCompositeOperation = laag === 'rook' ? 'source-over' : 'lighter'
        for (const d of deeltjes) {
          if (d.soort !== laag) continue
          const rest = 1 - d.leven / d.duur
          ctx.globalAlpha = laag === 'rook' ? rest * 0.9 : rest
          ctx.fillStyle = d.kleur
          ctx.beginPath()
          ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'

      // Schokgolven rond de inslag.
      for (const g of golven) {
        const verloop = (nu - g.start) / 750
        if (verloop < 0 || verloop > 1) continue
        ctx.globalAlpha = 1 - verloop
        ctx.strokeStyle = clubKleur
        ctx.lineWidth = 14 * (1 - verloop) + 1
        ctx.beginPath()
        ctx.arc(p3.x, p3.y, 30 + verloop * Math.min(B, H) * 0.42, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // De raket zelf, met een gloed eromheen.
      if (vliegt && el >= 0) {
        const gloed = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, raketGrootte * 1.1)
        gloed.addColorStop(0, 'rgba(255,214,140,0.55)')
        gloed.addColorStop(1, 'rgba(255,140,60,0)')
        ctx.fillStyle = gloed
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, raketGrootte * 1.1, 0, Math.PI * 2)
        ctx.fill()
        ctx.save()
        ctx.translate(pos.x, pos.y)
        ctx.rotate(emojiDraaiing(hoek))
        ctx.font = `${raketGrootte}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('🚀', 0, 0)
        ctx.restore()
      }

      if (el < INSLAG_MS + 2600 || deeltjes.length > 0) raf = requestAnimationFrame(teken)
    }
    raf = requestAnimationFrame(teken)
    return () => cancelAnimationFrame(raf)
  }, [vanRef, naarRef, kleur, tegenKleur])

  return <canvas ref={canvasRef} className="ktc-vlucht-canvas" aria-hidden />
}

// Wat de kantine te horen krijgt, afhankelijk van hoeveel foto's tegelijk binnenvallen.
const FOTO_TEKSTEN: { titel: string; sub: string }[] = [
  { titel: '📸 OH OHHH…', sub: 'hier komt ’m!' },
  { titel: '📸📸 OH OH OHHH!', sub: 'DUBBELSLAG — twee foto’s tegelijk!' },
  { titel: '🔥 OHHH DRIEDUBBEL!', sub: 'een hattrick van foto’s!' },
  { titel: '🎉 VIERKLAPPER!!', sub: 'vier in één keer — wie doet beter?' },
]
const fotoTekst = (n: number) =>
  n <= FOTO_TEKSTEN.length
    ? FOTO_TEKSTEN[n - 1]
    : { titel: '🌪️ FOTOSTORM!!!', sub: `${n} foto’s in één klap — de kantine ontploft!` }

/** Eén foto zoals de fotoshow ze toont — url is al relatief-af (zie match-channel.ts Instant). */
export type KantineFotoInstant = { id: number; url: string; authorName: string }

/**
 * "📸 OH OHHH… hier komt 'm!" met een 3-2-1-aftelklok, dan popt de foto als polaroid in beeld en
 * lost weer op. De foto zelf blijft daarna gewoon bij de wedstrijd staan (foto-tribune); dit is
 * enkel de korte schermvullende aankondiging.
 */
export function PhotoCelebration({ fotos, klaar }: { fotos: KantineFotoInstant[]; klaar: () => void }) {
  const [tel, setTel] = useState(FOTO_TEL_VANAF)
  const sleutel = fotos.map((f) => f.id).join(',')

  // Welke foto's zijn effectief bruikbaar? Eentje die niet laadt slaan we stilletjes over.
  const [ok, setOk] = useState<number[] | null>(null)

  useEffect(() => {
    let actief = true
    let open = fotos.length
    const goed: number[] = []
    const af = () => {
      if (--open === 0 && actief) setOk(goed)
    }
    for (const f of fotos) {
      const img = new Image()
      img.onload = () => {
        goed.push(f.id)
        af()
      }
      img.onerror = af
      img.src = f.url
    }
    return () => {
      actief = false
    }
    // eslint-disable-next-line
  }, [sleutel])

  useEffect(() => {
    setTel(FOTO_TEL_VANAF)
    const iv = setInterval(() => setTel((t) => Math.max(0, t - 1)), 1000)
    return () => clearInterval(iv)
  }, [sleutel])

  const toonbaar = ok ?? fotos.map((f) => f.id)
  const toonMs = Math.min(FOTO_TOON_MAX_MS, FOTO_TOON_MS + Math.max(0, toonbaar.length - 1) * 900)
  useEffect(() => {
    if (tel > 0) return
    if (ok != null && ok.length === 0) {
      klaar()
      return
    }
    const t = setTimeout(klaar, toonMs)
    return () => clearTimeout(t)
    // eslint-disable-next-line
  }, [tel, ok])

  const zichtbaar = useMemo(() => fotos.filter((f) => (ok == null ? true : ok.includes(f.id))), [fotos, ok])
  const n = zichtbaar.length
  const tekst = fotoTekst(Math.max(1, n))
  const heftig = n >= 3 ? ' heftig' : n >= 2 ? ' dubbel' : ''

  return (
    <div className={`ktc-fotoshow${heftig}`} aria-live="polite">
      {tel > 0 ? (
        <div className="ktc-fs-tease">
          <span className="ktc-fs-titel">{tekst.titel}</span>
          <span className="ktc-fs-sub">{tekst.sub}</span>
          <span key={tel} className="ktc-fs-tel">
            <i className="ktc-fs-ring" aria-hidden />
            {tel}
          </span>
        </div>
      ) : (
        <div className="ktc-fs-reveal">
          <div className={`ktc-fs-stapel n${Math.min(n, 6)}`} style={{ '--n': n } as CSSProperties}>
            {zichtbaar.map((f, i) => (
              <span key={f.id} className="ktc-fs-kaart" style={{ '--i': i } as CSSProperties}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.authorName ? `Foto van ${f.authorName}` : 'Supportersfoto'} />
                <span className="ktc-fs-wie">📸 {f.authorName || 'Supporter'}</span>
              </span>
            ))}
          </div>
          <span className="ktc-fs-onder">
            {n > 1 ? `📷 ${n} supportersfoto’s tegelijk!` : '📷 Supportersfoto'}
          </span>
        </div>
      )}
    </div>
  )
}
