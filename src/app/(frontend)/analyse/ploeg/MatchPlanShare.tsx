'use client'

import { useRef, useState } from 'react'

import { downloadBlob, saveOrShareBlob, slugFilename, svgToPngBlob } from '@/lib/client-download'
import type { GamePlan } from '@/lib/gameplan'

// Deelbare matchplan-kaart (1080×1080 PNG) in de editoriale stijl van de wedstrijd-deelkaart.
// Rendert het gameplan off-screen als SVG en zet het bij delen/downloaden om naar PNG.

const INK = '#f1f5f2'
const DIM = '#8a9c93'
const GOLD = '#c9a44c'
const FAINT = 'rgba(255,255,255,0.10)'
const TONE = { watch: '#ef476f', defend: '#4cc9f0', attack: '#06d6a0' }
const W = 1080
const M = 84

// Eenvoudige woord-wrap op tekenbreedte (SVG kent geen auto-wrap).
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  let overflow = false
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (next.length > maxChars && cur) {
      if (lines.length === maxLines - 1) {
        overflow = true
        break
      }
      lines.push(cur)
      cur = w
    } else {
      cur = next
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur)
  if (overflow && lines.length) {
    let last = lines[lines.length - 1]
    while ((last + '…').length > maxChars && last.length > 1) last = last.slice(0, -1)
    lines[lines.length - 1] = last.trimEnd() + '…'
  }
  return lines
}

const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)

export function MatchPlanShare({ plan }: { plan: GamePlan }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const fileName = () => `${slugFilename('matchplan', plan.opponent) || 'matchplan'}.png`
  const rasterize = async () => svgToPngBlob(svgRef.current!, { scale: 2, background: '#07120c' })

  const run = async (kind: 'share' | 'download') => {
    if (busy || !svgRef.current) return
    setBusy(true)
    setMsg(null)
    try {
      const blob = await rasterize()
      if (kind === 'share') await saveOrShareBlob(blob, fileName(), `Matchplan tegen ${plan.opponent}`)
      else downloadBlob(blob, fileName())
    } catch {
      setMsg('Kaart maken mislukt — probeer opnieuw.')
      setTimeout(() => setMsg(null), 3500)
    } finally {
      setBusy(false)
    }
  }

  // ── Verticale opbouw van de kaart ──
  const cols: { key: 'watch' | 'defend' | 'attack'; label: string }[] = [
    { key: 'watch', label: 'WIE KORT HOUDEN' },
    { key: 'defend', label: 'HOE VERDEDIGEN' },
    { key: 'attack', label: 'WAAR WIJ TOESLAAN' },
  ]
  const headlineLines = wrap(plan.headline, 46, 3)

  let y = 240
  const blocks: React.ReactNode[] = []
  for (const c of cols) {
    const items = plan[c.key].slice(0, 2)
    if (items.length === 0) continue
    blocks.push(
      <g key={c.key}>
        <rect x={M} y={y - 26} width={6} height={items.length * 64 + 12} rx={3} fill={TONE[c.key]} />
        <text x={M + 22} y={y} fontSize={24} fontWeight={800} letterSpacing="2.5" fill={TONE[c.key]}>{c.label}</text>
        {items.map((it, i) => (
          <text key={i} x={M + 22} y={y + 38 + i * 56} fontSize={30} fontWeight={700} fill={INK}>
            {trunc(it.title, 40)}
          </text>
        ))}
      </g>,
    )
    y += items.length * 64 + 60
  }

  return (
    <>
      <button type="button" className="sk-demo-cta" onClick={() => run('share')} disabled={busy}>
        {busy ? '⏳' : '📲 Deel'}
      </button>
      <button type="button" className="mp-print" onClick={() => run('download')} disabled={busy}>
        ⬇️ Kaart
      </button>
      {msg && <span className="an-pdf-msg">{msg}</span>}

      <div style={{ position: 'absolute', left: -99999, top: 0, width: W, height: W, pointerEvents: 'none' }} aria-hidden>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${W}`} width={W} height={W} xmlns="http://www.w3.org/2000/svg"
          fontFamily="'Inter','Segoe UI',system-ui,-apple-system,sans-serif">
          <defs>
            <linearGradient id="mpcardBg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0c1a12" />
              <stop offset="60%" stopColor="#071009" />
              <stop offset="100%" stopColor="#050d09" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width={W} height={W} fill="#07120c" />
          <rect x="0" y="0" width={W} height={W} fill="url(#mpcardBg)" />
          <rect x={Math.round(W * 0.035)} y={Math.round(W * 0.035)} width={W - Math.round(W * 0.07)} height={W - Math.round(W * 0.07)} rx="2" fill="none" stroke={FAINT} strokeWidth={1.5} />

          {/* Kop */}
          <text x={M} y={108} fontSize={34} fontWeight={800} letterSpacing="5" fill={INK}>KRACHTBAL <tspan fill={GOLD}>LIVE</tspan></text>
          <text x={W - M} y={108} textAnchor="end" fontSize={24} fontWeight={700} letterSpacing="3" fill={GOLD}>MATCHPLAN</text>
          <line x1={M} y1={134} x2={W - M} y2={134} stroke={FAINT} strokeWidth={1.5} />
          <text x={M} y={188} fontSize={52} fontWeight={800} letterSpacing="-1" fill={INK}>tegen {trunc(plan.opponent, 22)}</text>

          {/* Kopzin */}
          {headlineLines.map((ln, i) => (
            <text key={i} x={M} y={232 + i * 34} fontSize={26} fontWeight={600} fill={DIM}>{ln}</text>
          ))}

          {/* Luiken (y begint na de kopzin) */}
          <g transform={`translate(0, ${headlineLines.length * 34})`}>{blocks}</g>

          {/* Sleutels onderaan */}
          {plan.keys.length > 0 && (
            <>
              <line x1={M} y1={W - 150} x2={W - M} y2={W - 150} stroke={FAINT} strokeWidth={1.5} />
              <text x={M} y={W - 116} fontSize={22} fontWeight={800} letterSpacing="3" fill={GOLD}>SLEUTELS</text>
              {plan.keys.slice(0, 3).map((k, i) => (
                <text key={i} x={M} y={W - 80 + i * 24} fontSize={20} fill={INK}>
                  {i + 1}. {trunc(k, 78)}
                </text>
              ))}
            </>
          )}
          <text x={W / 2} y={W - 28} textAnchor="middle" fontSize={18} fontWeight={700} letterSpacing="4" fill={DIM}>KRACHTBAL.LIVE</text>
        </svg>
      </div>
    </>
  )
}
