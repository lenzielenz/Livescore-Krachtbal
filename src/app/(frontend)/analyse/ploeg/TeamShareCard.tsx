'use client'

import { useEffect, useRef, useState } from 'react'

import { readableOnDark } from '@/lib/club-colors'
import { downloadBlob, saveOrShareBlob, slugFilename, svgToPngBlob } from '@/lib/client-download'
import { urlToDataUrl } from '@/lib/share-image'

// Editoriale, exporteerbare ploeg-deelkaart (SVG → PNG, delen/downloaden) — het "team-DNA":
// clublogo, DNA-labels, het profielradar en de kerncijfers van het seizoen. Zelfde familie als
// de match- en speler-deelkaart.

type Axis = { label: string; frac: number }
type Chip = { label: string; val: string; sub?: string }
type Fmt = 'portret' | 'verhaal'

const FORMATS: Record<Fmt, { W: number; H: number; label: string }> = {
  portret: { W: 1080, H: 1350, label: 'Portret' },
  verhaal: { W: 1080, H: 1920, label: 'Verhaal' },
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const initials = (name: string) =>
  name.replace(/[^a-zA-Z0-9 ]/g, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'
const shortName = (name: string, max: number) => {
  const n = name.trim()
  return n.length > max ? n.slice(0, max - 1).trimEnd() + '…' : n
}

export function TeamShareCard({
  teamName,
  clubLogoUrl,
  colors,
  reeksLabel,
  season,
  tags,
  radar,
  chips,
  headline,
}: {
  teamName: string
  clubLogoUrl: string | null
  colors: { primary: string; secondary: string }
  reeksLabel: string
  season: string
  tags: string[]
  radar: Axis[]
  chips: Chip[]
  headline?: string | null
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [fmt, setFmt] = useState<Fmt>('portret')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [logo, setLogo] = useState<string | null>(null)
  const logoRef = useRef<string | null>(null)
  logoRef.current = logo

  useEffect(() => {
    let alive = true
    setLogo(null)
    if (!clubLogoUrl) return
    void urlToDataUrl(clubLogoUrl).then((d) => { if (alive) setLogo(d) })
    return () => { alive = false }
  }, [clubLogoUrl])

  const ensureLogo = async () => {
    if (!clubLogoUrl || logoRef.current) return
    setLogo(await urlToDataUrl(clubLogoUrl))
    await new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => res())))
  }

  const { W, H } = FORMATS[fmt]
  const c1 = readableOnDark(colors.primary)
  const INK = '#f1f5f2'
  const DIM = '#8a9c93'
  const FAINT = 'rgba(255,255,255,0.09)'
  const GOLD = '#c9a44c'
  const M = Math.round(W * 0.085)
  const upper = (s: string) => s.toUpperCase()

  const pad = Math.round(H * 0.045)
  const headerH = Math.round(H * 0.085)
  const footerH = Math.round(H * 0.05)
  const contentTop = pad + headerH
  const contentBot = H - footerH
  const avail = contentBot - contentTop
  const wId = 0.24, wHero = 0.44, wStats = 0.32
  const wSum = wId + wHero + wStats
  const gaps = 2
  const blockSpace = avail - Math.round(avail * 0.06)
  const gap = (avail - blockSpace) / gaps
  let y = contentTop
  const idBox = { y, h: blockSpace * (wId / wSum) }; y += idBox.h + gap
  const heroBox = { y, h: blockSpace * (wHero / wSum) }; y += heroBox.h + gap
  const statsBox = { y, h: blockSpace * (wStats / wSum) }

  const sectionSize = clamp(H * 0.0135, 16, 24)
  const Section = ({ label, yy, color = DIM }: { label: string; yy: number; color?: string }) => {
    const w = label.length * (sectionSize * 0.64 + 3.2) + 18
    return (
      <>
        <text x={M} y={yy} fontSize={sectionSize} fontWeight={700} letterSpacing="3" fill={color}>{label}</text>
        <line x1={M + w} y1={yy - sectionSize * 0.32} x2={W - M} y2={yy - sectionSize * 0.32} stroke={FAINT} strokeWidth={1.5} />
      </>
    )
  }

  // ── Identiteit: clublogo + teamnaam + DNA-labels. ──
  const Identity = () => {
    const logoR = clamp(idBox.h * 0.26, 34, 60)
    const cy = idBox.y + logoR
    const nameSize = clamp(idBox.h * 0.3, 34, 60)
    const tagLine = tags.slice(0, 3).map(upper).join('  ·  ')
    return (
      <>
        <circle cx={M + logoR} cy={cy} r={logoR} fill="#0a1610" stroke={c1} strokeWidth={2.5} strokeOpacity={0.55} />
        {logo ? (
          <>
            <clipPath id="tsc-clublogo"><circle cx={M + logoR} cy={cy} r={logoR - 4} /></clipPath>
            <image href={logo} x={M + logoR - (logoR - 4)} y={cy - (logoR - 4)} width={(logoR - 4) * 2} height={(logoR - 4) * 2} clipPath="url(#tsc-clublogo)" preserveAspectRatio="xMidYMid meet" />
          </>
        ) : (
          <text x={M + logoR} y={cy + logoR * 0.34} textAnchor="middle" fontSize={logoR * 0.8} fontWeight={800} fill={c1}>{initials(teamName)}</text>
        )}
        <text x={M + logoR * 2 + 22} y={cy - 2} fontSize={nameSize} fontWeight={800} letterSpacing="-1" fill={INK}>{upper(shortName(teamName, 18))}</text>
        {tagLine && <text x={M + logoR * 2 + 22} y={cy + nameSize * 0.62} fontSize={clamp(idBox.h * 0.14, 16, 24)} fontWeight={700} letterSpacing="2.5" fill={GOLD}>{tagLine}</text>}
        {headline && <text x={M} y={idBox.y + idBox.h * 0.99} fontSize={clamp(idBox.h * 0.15, 17, 26)} fill={DIM}>{headline}</text>}
      </>
    )
  }

  // ── Hero: het profielradar, groot en gecentreerd, in de clubkleur. ──
  const Hero = () => {
    const cx = W / 2
    const cy = heroBox.y + heroBox.h * 0.52
    const R = clamp(heroBox.h * 0.36, 90, 200)
    const n = radar.length || 1
    const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n
    const pt = (i: number, f: number): [number, number] => [cx + clamp(f, 0, 1) * R * Math.cos(ang(i)), cy + clamp(f, 0, 1) * R * Math.sin(ang(i))]
    const poly = (fs: number[]) => fs.map((f, i) => pt(i, f).join(',')).join(' ')
    const fracs = radar.map((a) => a.frac)
    return (
      <>
        <Section label="PLOEG-DNA" yy={heroBox.y - heroBox.h * 0.02} color={GOLD} />
        {[0.25, 0.5, 0.75, 1].map((f) => <polygon key={f} points={poly(radar.map(() => f))} fill="none" stroke={FAINT} strokeWidth={1.5} />)}
        {radar.map((a, i) => {
          const [lx, ly] = pt(i, 1.16)
          return <text key={a.label} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize={clamp(R * 0.1, 14, 22)} fontWeight={700} fill={DIM}>{upper(a.label)}</text>
        })}
        <polygon points={poly(fracs)} fill={c1} fillOpacity={0.22} stroke={c1} strokeWidth={3} strokeLinejoin="round" />
        {fracs.map((f, i) => { const [px, py] = pt(i, f); return <circle key={i} cx={px} cy={py} r={3.5} fill={c1} /> })}
      </>
    )
  }

  // ── Kerncijfers (3 kolommen). ──
  const Stats = () => {
    const cols = 3
    const rows = Math.ceil(chips.length / cols) || 1
    const colW = (W - 2 * M) / cols
    const rowH = statsBox.h / rows
    const numSize = clamp(rowH * 0.34, 26, 46)
    const labelSize = clamp(rowH * 0.12, 12, 18)
    return (
      <>
        <Section label="SEIZOEN IN CIJFERS" yy={statsBox.y - statsBox.h * 0.06} />
        {chips.map((c, idx) => {
          const col = idx % cols
          const row = Math.floor(idx / cols)
          const cx = M + colW * (col + 0.5)
          const top = statsBox.y + row * rowH
          const numY = top + rowH * 0.46
          return (
            <g key={c.label + idx}>
              {col > 0 && <line x1={M + colW * col} y1={top + rowH * 0.16} x2={M + colW * col} y2={top + rowH * 0.84} stroke={FAINT} strokeWidth={1.5} />}
              <text x={cx} y={numY} textAnchor="middle" fontSize={numSize} fontWeight={800} letterSpacing="-1" fill={INK}>{c.val}</text>
              <text x={cx} y={numY + labelSize * 1.7} textAnchor="middle" fontSize={labelSize} fontWeight={700} letterSpacing="1.5" fill={DIM}>{upper(c.label)}</text>
              {c.sub && <text x={cx} y={numY + labelSize * 3} textAnchor="middle" fontSize={labelSize * 0.92} fill={DIM} opacity={0.75}>{c.sub}</text>}
            </g>
          )
        })}
      </>
    )
  }

  const brandSize = clamp(headerH * 0.34, 26, 42)
  const metaSize = clamp(headerH * 0.2, 16, 24)
  const headRuleY = pad + brandSize + metaSize * 0.6

  const rasterize = async () => svgToPngBlob(svgRef.current!, { scale: 2, background: '#07120c' })
  const fileName = () => `${slugFilename('krachtbal', teamName, 'dna') || 'krachtbal-ploeg'}.png`

  const share = async () => {
    if (busy || !svgRef.current) return
    setBusy(true); setMsg(null)
    try {
      await ensureLogo()
      await saveOrShareBlob(await rasterize(), fileName(), `${teamName} — ${reeksLabel}`)
    } catch { setMsg('Kaart maken mislukt — probeer opnieuw.'); setTimeout(() => setMsg(null), 3500) }
    finally { setBusy(false) }
  }
  const download = async () => {
    if (busy || !svgRef.current) return
    setBusy(true); setMsg(null)
    try { await ensureLogo(); downloadBlob(await rasterize(), fileName()) }
    catch { setMsg('Download mislukt — probeer opnieuw.'); setTimeout(() => setMsg(null), 3500) }
    finally { setBusy(false) }
  }

  return (
    <div className="an-share">
      <div className="an-share-controls">
        <div className="an-share-fmt" role="group" aria-label="Formaat">
          {(Object.keys(FORMATS) as Fmt[]).map((f) => (
            <button key={f} type="button" className={`an-share-fmt-btn${fmt === f ? ' on' : ''}`} onClick={() => setFmt(f)}>
              {FORMATS[f].label}
            </button>
          ))}
        </div>
      </div>

      <div className="an-share-actions">
        <button type="button" className="sk-demo-cta" onClick={share} disabled={busy}>
          {busy ? '⏳ Bezig…' : '📲 Delen'}
        </button>
        <button type="button" className="an-share-dl" onClick={download} disabled={busy}>⬇️ Downloaden</button>
        {msg && <span className="an-pdf-msg">{msg}</span>}
      </div>

      {/* Off-screen render-doel — wordt naar PNG omgezet bij delen/downloaden. */}
      <div style={{ position: 'absolute', left: -99999, top: 0, width: W, height: H, pointerEvents: 'none' }} aria-hidden>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width={W} height={H} xmlns="http://www.w3.org/2000/svg"
          fontFamily="'Inter','Segoe UI',system-ui,-apple-system,sans-serif">
          <defs>
            <linearGradient id="tsc-bg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0c1a12" />
              <stop offset="55%" stopColor="#071009" />
              <stop offset="100%" stopColor="#050d09" />
            </linearGradient>
            <radialGradient id="tsc-vign" cx="50%" cy="42%" r="75%">
              <stop offset="60%" stopColor="#000000" stopOpacity={0} />
              <stop offset="100%" stopColor="#000000" stopOpacity={0.45} />
            </radialGradient>
          </defs>

          <rect x="0" y="0" width={W} height={H} fill="#07120c" />
          <rect x="0" y="0" width={W} height={H} fill="url(#tsc-bg)" />
          <rect x="0" y="0" width={W} height={Math.round(H * 0.14)} fill={c1} opacity={0.07} />
          <rect x="0" y={H - Math.round(H * 0.14)} width={W} height={Math.round(H * 0.14)} fill={c1} opacity={0.05} />
          <rect x="0" y="0" width={W} height={H} fill="url(#tsc-vign)" />
          <rect x={Math.round(W * 0.04)} y={Math.round(W * 0.04)} width={W - Math.round(W * 0.08)} height={H - Math.round(W * 0.08)} rx="2" fill="none" stroke={FAINT} strokeWidth={1.5} />

          {/* Kop */}
          <text x={M} y={pad + brandSize} fontSize={brandSize} fontWeight={800} letterSpacing="5" fill={INK}>KRACHTBAL <tspan fill={GOLD}>LIVE</tspan></text>
          <line x1={M} y1={headRuleY} x2={W - M} y2={headRuleY} stroke={FAINT} strokeWidth={1.5} />
          <text x={M} y={headRuleY + metaSize * 1.5} fontSize={metaSize} letterSpacing="2" fill={DIM}>{upper(reeksLabel)}</text>
          <text x={W - M} y={headRuleY + metaSize * 1.5} textAnchor="end" fontSize={metaSize} letterSpacing="2" fill={DIM}>SEIZOEN {season}</text>

          <Identity />
          <Hero />
          <Stats />

          {/* Voet */}
          <line x1={M} y1={H - footerH} x2={W - M} y2={H - footerH} stroke={FAINT} strokeWidth={1.5} />
          <text x={W / 2} y={H - footerH * 0.36} textAnchor="middle" fontSize={clamp(footerH * 0.34, 16, 24)} fontWeight={700} letterSpacing="4" fill={DIM}>KRACHTBAL.LIVE</text>
        </svg>
      </div>
    </div>
  )
}
