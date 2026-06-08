'use client'

import { useEffect, useRef, useState } from 'react'

import { DEFAULT_AWAY_COLOR, DEFAULT_HOME_COLOR, readableOnDark } from '@/lib/club-colors'
import { downloadBlob, saveOrShareBlob, slugFilename, svgToPngBlob } from '@/lib/client-download'
import { urlToDataUrl } from '@/lib/share-image'

// "Deel dit moment": legt de HUIDIGE live-stand vast als een verzorgde deelkaart (SVG → PNG),
// terwijl de wedstrijd bezig is — de live tegenhanger van de match-deelkaart na afloop.

type SideTeam = { name: string; logoUrl: string | null; color: string | null }

const initials = (name: string) =>
  name.replace(/[^a-zA-Z0-9 ]/g, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'
const shortName = (name: string, max = 15) => {
  const n = name.trim()
  return n.length > max ? n.slice(0, max - 1).trimEnd() + '…' : n
}
const fmtClock = (total: number) => {
  const s = Math.max(0, Math.floor(total))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function LiveMomentCard({
  matchId,
  teams,
  score,
  clockSeconds,
  half,
  status,
  reeks,
}: {
  matchId: number
  teams: { home: SideTeam; away: SideTeam }
  score: { home: number; away: number }
  clockSeconds: number
  half: number
  status: 'scheduled' | 'live' | 'finished'
  reeks: string
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [logos, setLogos] = useState<{ home: string | null; away: string | null }>({ home: null, away: null })
  const logosRef = useRef(logos)
  logosRef.current = logos

  useEffect(() => {
    let alive = true
    void Promise.all([
      teams.home.logoUrl ? urlToDataUrl(teams.home.logoUrl) : Promise.resolve(null),
      teams.away.logoUrl ? urlToDataUrl(teams.away.logoUrl) : Promise.resolve(null),
    ]).then(([h, a]) => {
      if (alive) setLogos({ home: h, away: a })
    })
    return () => { alive = false }
  }, [teams.home.logoUrl, teams.away.logoUrl])

  const ensureLogos = async () => {
    const cur = logosRef.current
    const needH = teams.home.logoUrl && !cur.home
    const needA = teams.away.logoUrl && !cur.away
    if (!needH && !needA) return
    const [h, a] = await Promise.all([
      needH ? urlToDataUrl(teams.home.logoUrl!) : Promise.resolve(cur.home),
      needA ? urlToDataUrl(teams.away.logoUrl!) : Promise.resolve(cur.away),
    ])
    setLogos({ home: h, away: a })
    await new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => res())))
  }

  const W = 1080
  const H = 1080
  const INK = '#f1f5f2'
  const DIM = '#8a9c93'
  const FAINT = 'rgba(255,255,255,0.09)'
  const GOLD = '#c9a44c'
  const M = Math.round(W * 0.085)
  const homeC = readableOnDark(teams.home.color ?? DEFAULT_HOME_COLOR)
  const awayC = readableOnDark(teams.away.color ?? DEFAULT_AWAY_COLOR)
  const upper = (s: string) => s.toUpperCase()
  const statusLabel = status === 'live' ? 'LIVE' : status === 'finished' ? 'EINDSTAND' : 'GEPLAND'
  const winner = score.home > score.away ? 'home' : score.away > score.home ? 'away' : 'draw'

  const ClubMark = ({ side }: { side: 'home' | 'away' }) => {
    const cx = side === 'home' ? W * 0.27 : W * 0.73
    const cy = H * 0.42
    const r = 120
    const c = side === 'home' ? homeC : awayC
    const data = side === 'home' ? logos.home : logos.away
    const name = side === 'home' ? teams.home.name : teams.away.name
    return (
      <g>
        <circle cx={cx} cy={cy} r={r} fill="#0a1610" stroke={c} strokeWidth={3} strokeOpacity={0.55} />
        {data ? (
          <>
            <clipPath id={`lmc-clip-${side}`}><circle cx={cx} cy={cy} r={r - 6} /></clipPath>
            <image href={data} x={cx - (r - 6)} y={cy - (r - 6)} width={(r - 6) * 2} height={(r - 6) * 2} clipPath={`url(#lmc-clip-${side})`} preserveAspectRatio="xMidYMid meet" />
          </>
        ) : (
          <text x={cx} y={cy + r * 0.32} textAnchor="middle" fontSize={r * 0.74} fontWeight={800} fill={c}>{initials(name)}</text>
        )}
        <text x={cx} y={cy + r + 44} textAnchor="middle" fontSize={34} fontWeight={700} letterSpacing="1.5" fill={INK}>{upper(shortName(name))}</text>
      </g>
    )
  }

  const rasterize = async () => svgToPngBlob(svgRef.current!, { scale: 2, background: '#07120c' })
  const fileName = () => `${slugFilename('krachtbal-moment', teams.home.name, teams.away.name) || `krachtbal-moment-${matchId}`}.png`

  const share = async () => {
    if (busy || !svgRef.current) return
    setBusy(true); setMsg(null)
    try {
      await ensureLogos()
      await saveOrShareBlob(await rasterize(), fileName(), `${teams.home.name} ${score.home}–${score.away} ${teams.away.name} — ${statusLabel}`)
    } catch { setMsg('Kaart maken mislukt — probeer opnieuw.'); setTimeout(() => setMsg(null), 3000) }
    finally { setBusy(false) }
  }
  const download = async () => {
    if (busy || !svgRef.current) return
    setBusy(true); setMsg(null)
    try { await ensureLogos(); downloadBlob(await rasterize(), fileName()) }
    catch { setMsg('Download mislukt.'); setTimeout(() => setMsg(null), 3000) }
    finally { setBusy(false) }
  }

  const scoreSize = 260
  const baseline = H * 0.66
  const sgap = scoreSize * 0.62

  return (
    <div className="sb-moment">
      <button type="button" className="sb-moment-btn" onClick={share} disabled={busy}>
        {busy ? '⏳ Bezig…' : '📸 Deel dit moment'}
      </button>
      <button type="button" className="sb-moment-dl" onClick={download} disabled={busy} aria-label="Moment downloaden">⬇️</button>
      {msg && <span className="sb-moment-msg">{msg}</span>}

      {/* Off-screen render-doel. */}
      <div style={{ position: 'absolute', left: -99999, top: 0, width: W, height: H, pointerEvents: 'none' }} aria-hidden>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width={W} height={H} xmlns="http://www.w3.org/2000/svg"
          fontFamily="'Inter','Segoe UI',system-ui,-apple-system,sans-serif">
          <defs>
            <linearGradient id="lmc-bg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0c1a12" />
              <stop offset="55%" stopColor="#071009" />
              <stop offset="100%" stopColor="#050d09" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width={W} height={H} fill="#07120c" />
          <rect x="0" y="0" width={W} height={H} fill="url(#lmc-bg)" />
          <rect x="0" y="0" width={W} height={Math.round(H * 0.16)} fill={homeC} opacity={0.06} />
          <rect x="0" y={H - Math.round(H * 0.16)} width={W} height={Math.round(H * 0.16)} fill={awayC} opacity={0.06} />
          <rect x={Math.round(W * 0.04)} y={Math.round(W * 0.04)} width={W - Math.round(W * 0.08)} height={H - Math.round(W * 0.08)} rx="2" fill="none" stroke={FAINT} strokeWidth={1.5} />

          {/* Kop: merk + status-badge. */}
          <text x={M} y={M + 24} fontSize={40} fontWeight={800} letterSpacing="5" fill={INK}>KRACHTBAL <tspan fill={GOLD}>LIVE</tspan></text>
          <g transform={`translate(${W - M - 150}, ${M - 8})`}>
            <rect x="0" y="0" width="150" height="48" rx="24" fill={status === 'live' ? '#ff5a5f' : 'rgba(255,255,255,0.08)'} />
            {status === 'live' && <circle cx="26" cy="24" r="7" fill="#fff" />}
            <text x={status === 'live' ? 86 : 75} y="32" textAnchor="middle" fontSize="22" fontWeight="800" letterSpacing="2" fill={status === 'live' ? '#fff' : DIM}>{statusLabel}</text>
          </g>
          <line x1={M} y1={M + 52} x2={W - M} y2={M + 52} stroke={FAINT} strokeWidth={1.5} />
          <text x={M} y={M + 92} fontSize={26} letterSpacing="2" fill={DIM}>{upper(reeks)}</text>

          <ClubMark side="home" />
          <ClubMark side="away" />

          {/* Score + klok. */}
          <text x={W / 2 - sgap} y={baseline} textAnchor="middle" fontSize={scoreSize} fontWeight={800} letterSpacing="-3" fill={winner === 'away' ? DIM : INK}>{score.home}</text>
          <text x={W / 2} y={baseline - scoreSize * 0.12} textAnchor="middle" fontSize={scoreSize * 0.5} fontWeight={300} fill={DIM}>–</text>
          <text x={W / 2 + sgap} y={baseline} textAnchor="middle" fontSize={scoreSize} fontWeight={800} letterSpacing="-3" fill={winner === 'home' ? DIM : INK}>{score.away}</text>
          <text x={W / 2} y={baseline + 70} textAnchor="middle" fontSize={56} fontWeight={800} letterSpacing="2" fill={GOLD}>{fmtClock(clockSeconds)}</text>
          {status !== 'finished' && (
            <text x={W / 2} y={baseline + 116} textAnchor="middle" fontSize={26} fontWeight={700} letterSpacing="3" fill={DIM}>HELFT {half}</text>
          )}

          {/* Voet. */}
          <line x1={M} y1={H - M - 28} x2={W - M} y2={H - M - 28} stroke={FAINT} strokeWidth={1.5} />
          <text x={W / 2} y={H - M + 6} textAnchor="middle" fontSize={24} fontWeight={700} letterSpacing="4" fill={DIM}>KRACHTBAL.LIVE</text>
        </svg>
      </div>
    </div>
  )
}
