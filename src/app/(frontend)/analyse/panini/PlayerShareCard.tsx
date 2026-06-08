'use client'

import { useEffect, useRef, useState } from 'react'

import { downloadBlob, saveOrShareBlob, slugFilename, svgToPngBlob } from '@/lib/client-download'
import { urlToDataUrl } from '@/lib/share-image'

// Editoriale, exporteerbare speler-deelkaart (SVG → PNG, delen/downloaden), in dezelfde familie
// als de match-deelkaart. Vervangt het "maak een screenshot"-advies door een echte deel-knop.

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

// Rating (0..100) → kleur op een rood → amber → groen-schaal.
function ratingColor(v: number): string {
  const t = clamp(v / 100, 0, 1)
  const s: [number, [number, number, number]][] = [
    [0, [239, 71, 111]],
    [0.5, [255, 209, 102]],
    [1, [62, 201, 138]],
  ]
  let lo = s[0]
  let hi = s[s.length - 1]
  for (let i = 0; i < s.length - 1; i++) if (t >= s[i][0] && t <= s[i + 1][0]) { lo = s[i]; hi = s[i + 1]; break }
  const f = (t - lo[0]) / (hi[0] - lo[0] || 1)
  const c = lo[1].map((x, i) => Math.round(x + (hi[1][i] - x) * f))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

export function PlayerShareCard({
  name,
  shirtNumber,
  teamName,
  clubLogoUrl,
  colors,
  rating,
  att,
  def,
  axes,
  chips,
  profile,
  reeksLabel,
  season,
}: {
  name: string
  shirtNumber: number
  teamName: string
  clubLogoUrl: string | null
  colors: { primary: string; secondary: string }
  rating: number
  att: number
  def: number
  axes: Axis[]
  chips: Chip[]
  profile: string
  reeksLabel: string
  season: string
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
    const d = await urlToDataUrl(clubLogoUrl)
    setLogo(d)
    await new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => res())))
  }

  const { W, H } = FORMATS[fmt]
  const rc = ratingColor(rating)
  const c1 = colors.primary
  const INK = '#f1f5f2'
  const DIM = '#8a9c93'
  const FAINT = 'rgba(255,255,255,0.09)'
  const GOLD = '#c9a44c'
  const M = Math.round(W * 0.085)
  const upper = (s: string) => s.toUpperCase()

  // Verticale flow met gewichten (zoals de match-deelkaart) zodat beide formaten netjes vullen.
  const pad = Math.round(H * 0.045)
  const headerH = Math.round(H * 0.085)
  const footerH = Math.round(H * 0.05)
  const contentTop = pad + headerH
  const contentBot = H - footerH
  const avail = contentBot - contentTop
  const wId = 0.2, wHero = 0.4, wAtt = 0.12, wStats = 0.28
  const wSum = wId + wHero + wAtt + wStats
  const gaps = 3
  const blockSpace = avail - Math.round(avail * 0.07)
  const gap = (avail - blockSpace) / gaps
  let y = contentTop
  const idBox = { y, h: blockSpace * (wId / wSum) }; y += idBox.h + gap
  const heroBox = { y, h: blockSpace * (wHero / wSum) }; y += heroBox.h + gap
  const attBox = { y, h: blockSpace * (wAtt / wSum) }; y += attBox.h + gap
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

  // ── Identiteit: clublogo + naam, groot rugnummer + spelernaam, profiel. ──
  const Identity = () => {
    const logoR = clamp(idBox.h * 0.2, 26, 46)
    const clubY = idBox.y + logoR
    const nameSize = clamp(idBox.h * 0.34, 40, 74)
    const numSize = nameSize * 0.62
    return (
      <>
        <circle cx={M + logoR} cy={clubY} r={logoR} fill="#0a1610" stroke={c1} strokeWidth={2.5} strokeOpacity={0.55} />
        {logo ? (
          <>
            <clipPath id="psc-clublogo"><circle cx={M + logoR} cy={clubY} r={logoR - 4} /></clipPath>
            <image href={logo} x={M + logoR - (logoR - 4)} y={clubY - (logoR - 4)} width={(logoR - 4) * 2} height={(logoR - 4) * 2} clipPath="url(#psc-clublogo)" preserveAspectRatio="xMidYMid meet" />
          </>
        ) : (
          <text x={M + logoR} y={clubY + logoR * 0.34} textAnchor="middle" fontSize={logoR * 0.8} fontWeight={800} fill={c1}>{initials(teamName)}</text>
        )}
        <text x={M + logoR * 2 + 18} y={clubY + logoR * 0.32} fontSize={clamp(idBox.h * 0.2, 22, 34)} fontWeight={700} letterSpacing="1" fill={INK}>{upper(shortName(teamName, 22))}</text>
        <text x={M} y={idBox.y + idBox.h * 0.78} fontSize={nameSize} fontWeight={800} letterSpacing="-1.5" fill={INK}>
          <tspan fill={GOLD}>#{shirtNumber}</tspan> {upper(shortName(name, 16))}
        </text>
        <text x={M} y={idBox.y + idBox.h * 0.98} fontSize={clamp(idBox.h * 0.15, 17, 26)} fontWeight={700} letterSpacing="3" fill={GOLD}>{upper(profile)}</text>
        <text x={W - M} y={idBox.y + idBox.h * 0.78} textAnchor="end" fontSize={numSize} fontWeight={300} letterSpacing="2" fill={DIM} opacity={0.5}>{season}</text>
      </>
    )
  }

  // ── Hero: OVR-rating links, radar rechts. ──
  const Hero = () => {
    const cy = heroBox.y + heroBox.h * 0.5
    // Rating-ring links.
    const rX = M + W * 0.16
    const ringR = clamp(heroBox.h * 0.34, 70, 150)
    const ratingSize = ringR * 0.95
    // Radar rechts.
    const radCx = W - M - W * 0.2
    const radR = clamp(heroBox.h * 0.34, 70, 150)
    const n = axes.length || 1
    const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n
    const pt = (i: number, f: number): [number, number] => [radCx + clamp(f, 0, 1) * radR * Math.cos(ang(i)), cy + clamp(f, 0, 1) * radR * Math.sin(ang(i))]
    const poly = (fs: number[]) => fs.map((f, i) => pt(i, f).join(',')).join(' ')
    const fracs = axes.map((a) => a.frac)
    return (
      <>
        {/* OVR */}
        <circle cx={rX} cy={cy} r={ringR} fill="none" stroke={rc} strokeWidth={Math.max(5, ringR * 0.06)} strokeOpacity={0.85} />
        <text x={rX} y={cy + ratingSize * 0.18} textAnchor="middle" fontSize={ratingSize} fontWeight={800} letterSpacing="-3" fill={rc}>{rating}</text>
        <text x={rX} y={cy + ringR + sectionSize * 1.4} textAnchor="middle" fontSize={sectionSize} fontWeight={700} letterSpacing="4" fill={DIM}>OVERALL</text>
        {/* Radar */}
        {[0.5, 1].map((f) => <polygon key={f} points={poly(axes.map(() => f))} fill="none" stroke={FAINT} strokeWidth={1.5} />)}
        {axes.map((a, i) => { const [x, yy] = pt(i, 1.2); return <text key={a.label} x={x} y={yy} textAnchor="middle" dominantBaseline="middle" fontSize={clamp(radR * 0.12, 13, 20)} fontWeight={700} fill={DIM}>{a.label}</text> })}
        <polygon points={poly(fracs)} fill={rc} fillOpacity={0.22} stroke={rc} strokeWidth={2.5} strokeLinejoin="round" />
        {fracs.map((f, i) => { const [x, yy] = pt(i, f); return <circle key={i} cx={x} cy={yy} r={3} fill={rc} /> })}
      </>
    )
  }

  // ── Aanval / Verdediging (twee grote percentielen). ──
  const AttDef = () => {
    const colW = (W - 2 * M) / 2
    const numSize = clamp(attBox.h * 0.5, 36, 60)
    const numY = attBox.y + attBox.h * 0.52
    const items = [
      { v: att, label: 'AANVAL' },
      { v: def, label: 'VERDEDIGING' },
    ]
    return (
      <>
        {items.map((it, i) => {
          const cx = M + colW * (i + 0.5)
          return (
            <g key={it.label}>
              {i > 0 && <line x1={M + colW} y1={attBox.y + attBox.h * 0.12} x2={M + colW} y2={attBox.y + attBox.h * 0.9} stroke={FAINT} strokeWidth={1.5} />}
              <text x={cx} y={numY} textAnchor="middle" fontSize={numSize} fontWeight={800} letterSpacing="-1" fill={ratingColor(it.v)}>{it.v}</text>
              <text x={cx} y={numY + numSize * 0.55} textAnchor="middle" fontSize={clamp(attBox.h * 0.16, 14, 22)} fontWeight={700} letterSpacing="2" fill={DIM}>{it.label}</text>
            </g>
          )
        })}
      </>
    )
  }

  // ── Kerncijfers (3 kolommen, met dunne scheidingslijnen). ──
  const Stats = () => {
    const cols = 3
    const rows = Math.ceil(chips.length / cols) || 1
    const colW = (W - 2 * M) / cols
    const rowH = statsBox.h / rows
    const numSize = clamp(rowH * 0.34, 26, 44)
    const labelSize = clamp(rowH * 0.12, 12, 18)
    return (
      <>
        <Section label="SEIZOEN IN CIJFERS" yy={statsBox.y - statsBox.h * 0.07} />
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
  const fileName = () => `${slugFilename('krachtbal', name, teamName) || 'krachtbal-speler'}.png`

  const share = async () => {
    if (busy || !svgRef.current) return
    setBusy(true); setMsg(null)
    try {
      await ensureLogo()
      await saveOrShareBlob(await rasterize(), fileName(), `${name} · ${teamName} — ${reeksLabel}`)
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
            <linearGradient id="psc-bg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0c1a12" />
              <stop offset="55%" stopColor="#071009" />
              <stop offset="100%" stopColor="#050d09" />
            </linearGradient>
            <radialGradient id="psc-vign" cx="50%" cy="40%" r="75%">
              <stop offset="60%" stopColor="#000000" stopOpacity={0} />
              <stop offset="100%" stopColor="#000000" stopOpacity={0.45} />
            </radialGradient>
          </defs>

          <rect x="0" y="0" width={W} height={H} fill="#07120c" />
          <rect x="0" y="0" width={W} height={H} fill="url(#psc-bg)" />
          <rect x="0" y="0" width={W} height={Math.round(H * 0.14)} fill={c1} opacity={0.06} />
          <rect x="0" y={H - Math.round(H * 0.14)} width={W} height={Math.round(H * 0.14)} fill={rc} opacity={0.06} />
          <rect x="0" y="0" width={W} height={H} fill="url(#psc-vign)" />
          <rect x={Math.round(W * 0.04)} y={Math.round(W * 0.04)} width={W - Math.round(W * 0.08)} height={H - Math.round(W * 0.08)} rx="2" fill="none" stroke={FAINT} strokeWidth={1.5} />

          {/* Kop */}
          <text x={M} y={pad + brandSize} fontSize={brandSize} fontWeight={800} letterSpacing="5" fill={INK}>KRACHTBAL <tspan fill={GOLD}>LIVE</tspan></text>
          <line x1={M} y1={headRuleY} x2={W - M} y2={headRuleY} stroke={FAINT} strokeWidth={1.5} />
          <text x={M} y={headRuleY + metaSize * 1.5} fontSize={metaSize} letterSpacing="2" fill={DIM}>{upper(reeksLabel)}</text>
          <text x={W - M} y={headRuleY + metaSize * 1.5} textAnchor="end" fontSize={metaSize} letterSpacing="2" fill={DIM}>SEIZOEN {season}</text>

          <Identity />
          <Hero />
          <AttDef />
          <Stats />

          {/* Voet */}
          <line x1={M} y1={H - footerH} x2={W - M} y2={H - footerH} stroke={FAINT} strokeWidth={1.5} />
          <text x={W / 2} y={H - footerH * 0.36} textAnchor="middle" fontSize={clamp(footerH * 0.34, 16, 24)} fontWeight={700} letterSpacing="4" fill={DIM}>KRACHTBAL.LIVE</text>
        </svg>
      </div>
    </div>
  )
}
