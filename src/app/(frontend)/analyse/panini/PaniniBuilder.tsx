'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { TeamLogo } from '@/components/TeamLogo'
import type { RadarPlayer } from '@/lib/radar-stats'

type ClubInfo = { name: string; logoUrl: string | null; primary: string | null; secondary: string | null }

// Verwijdert (bijna-)wit uit een logo zodat het naadloos op de gekleurde kaart komt. Werkt voor
// logo's van dezelfde oorsprong; bij een CORS-beperking valt het terug op het originele logo.
function removeWhite(src: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const w = img.naturalWidth
        const h = img.naturalHeight
        if (!w || !h) return resolve(src)
        const cv = document.createElement('canvas')
        cv.width = w
        cv.height = h
        const ctx = cv.getContext('2d')
        if (!ctx) return resolve(src)
        ctx.drawImage(img, 0, 0)
        const im = ctx.getImageData(0, 0, w, h)
        const a = im.data
        for (let i = 0; i < a.length; i += 4) {
          const mn = Math.min(a[i], a[i + 1], a[i + 2])
          if (a[i] >= 232 && a[i + 1] >= 232 && a[i + 2] >= 232) a[i + 3] = 0
          else if (mn >= 205) a[i + 3] = Math.round(a[i + 3] * Math.max(0, (255 - mn) / 50))
        }
        ctx.putImageData(im, 0, 0)
        resolve(cv.toDataURL('image/png'))
      } catch {
        resolve(src)
      }
    }
    img.onerror = () => resolve(src)
    img.src = src
  })
}

// Radar-assen (zelfde als de spelersradar) — voor de mini-radar op de kaart.
const AXES: { key: string; label: string; get: (p: RadarPlayer) => number }[] = [
  { key: 'aanval', label: 'AAN', get: (p) => p.throwsPerMatch },
  { key: 'doel', label: 'DOEL', get: (p) => p.goalsPerMatch },
  { key: 'succes', label: 'SUC', get: (p) => p.conversion * 100 },
  { key: 'effic', label: 'EFF', get: (p) => p.diff },
  { key: 'afstand', label: 'AFS', get: (p) => p.avgDistance },
  { key: 'forceren', label: 'FOR', get: (p) => p.forcedPerMatch },
  { key: 'verded', label: 'VER', get: (p) => p.catchesPerMatch },
]
const ATT = ['aanval', 'doel', 'succes', 'effic', 'afstand', 'forceren']
const DEF = ['verded']

const N = AXES.length
const SZ = 150
const C = SZ / 2
const R = 56
const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / N
const pt = (i: number, f: number): [number, number] => [C + Math.max(0, Math.min(1, f)) * R * Math.cos(ang(i)), C + Math.max(0, Math.min(1, f)) * R * Math.sin(ang(i))]
const poly = (fs: number[]) => fs.map((f, i) => pt(i, f).join(',')).join(' ')

function pctColor(t: number): string {
  const s: [number, [number, number, number]][] = [[0, [239, 71, 111]], [0.5, [255, 209, 102]], [1, [6, 214, 160]]]
  let lo = s[0]
  let hi = s[s.length - 1]
  for (let i = 0; i < s.length - 1; i++) if (t >= s[i][0] && t <= s[i + 1][0]) { lo = s[i]; hi = s[i + 1]; break }
  const f = (t - lo[0]) / (hi[0] - lo[0] || 1)
  const c = lo[1].map((v, i) => Math.round(v + (hi[1][i] - v) * f))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

function profileOf(att: number, def: number): string {
  if (att >= 66 && def >= 66) return 'COMPLETE SPELER'
  if (att - def >= 18) return 'AANVALLER'
  if (def - att >= 18) return 'VERDEDIGER'
  return 'ALLROUNDER'
}

export function PaniniBuilder({ reeks, reeksLabel, options, players, clubs }: { reeks: string; reeksLabel: string; options: { value: string; label: string }[]; players: RadarPlayer[]; clubs: Record<number, ClubInfo> }) {
  const router = useRouter()
  const [pid, setPid] = useState<number | null>(players[0]?.playerId ?? null)

  const sorted = useMemo(() => {
    const m: Record<string, number[]> = {}
    for (const a of AXES) m[a.key] = players.map((p) => a.get(p)).sort((x, y) => x - y)
    return m
  }, [players])
  const pct = (key: string, v: number): number => {
    const arr = sorted[key]
    if (!arr || !arr.length) return 0
    let le = 0
    for (const x of arr) if (x <= v) le++
    return le / arr.length
  }
  const sub = (p: RadarPlayer, keys: string[]) => Math.round((keys.reduce((s, k) => s + pct(k, (AXES.find((a) => a.key === k) as { get: (x: RadarPlayer) => number }).get(p)), 0) / keys.length) * 100)

  const player = players.find((p) => p.playerId === pid) ?? null
  const club: ClubInfo | undefined = player?.teamId != null ? clubs[player.teamId] : undefined

  // Logo zonder wit voorbereiden zodra de speler/club wijzigt.
  const [cleanLogo, setCleanLogo] = useState<string | null>(null)
  const rawLogo = club?.logoUrl ?? null
  useEffect(() => {
    setCleanLogo(null)
    if (!rawLogo) return
    let cancelled = false
    void removeWhite(rawLogo).then((url) => { if (!cancelled) setCleanLogo(url) })
    return () => { cancelled = true }
  }, [rawLogo])
  const logo = cleanLogo ?? rawLogo

  return (
    <div className="pan-wrap">
      <div className="rad-controls">
        <label className="rad-field">
          <span>Reeks</span>
          <select className="rang-picker" value={reeks} onChange={(e) => router.push(`/analyse/panini?reeks=${e.target.value}`)}>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="rad-field">
          <span>Speler</span>
          <select className="rang-picker" value={pid ?? ''} onChange={(e) => setPid(e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>
            {players.map((p) => <option key={p.playerId} value={p.playerId}>#{p.shirtNumber} {p.name} · {p.teamName}</option>)}
          </select>
        </label>
      </div>

      {players.length === 0 ? (
        <p className="empty">Nog geen spelersdata in deze reeks.</p>
      ) : !player ? (
        <p className="empty">Kies een speler om zijn Panini te maken.</p>
      ) : (() => {
        const rating = Math.round((AXES.reduce((s, a) => s + pct(a.key, a.get(player)), 0) / N) * 100)
        const att = sub(player, ATT)
        const def = sub(player, DEF)
        const fracs = AXES.map((a) => pct(a.key, a.get(player)))
        const rc = pctColor(rating / 100)
        const c1 = club?.primary || '#ffd873'
        const c2 = club?.secondary || rc
        const chips = [
          { ic: '⚽', lbl: 'Doelpunten', val: `${player.goals}`, sub: `${player.goalsPerMatch.toFixed(1)}/wd` },
          { ic: '🎯', lbl: 'Conversie', val: `${Math.round(player.conversion * 100)}%`, sub: '' },
          { ic: '⚡', lbl: 'Efficiëntie', val: player.diff > 0 ? `+${player.diff.toFixed(1)}` : player.diff.toFixed(1), sub: 'xP±' },
          { ic: '📏', lbl: 'Gem. afstand', val: `${player.avgDistance.toFixed(1)}m`, sub: `max ${player.maxDistance.toFixed(0)}m` },
          { ic: '🛡️', lbl: 'Verdediging', val: `${player.catchesPerMatch.toFixed(1)}`, sub: '/wd' },
          { ic: '🗓️', lbl: 'Wedstrijden', val: `${player.matches}`, sub: `${player.points} ptn` },
        ]
        return (
          <div className="pan-stage">
            <div className="pan-card" style={{ ['--rc' as string]: rc, ['--c1' as string]: c1, ['--c2' as string]: c2 }}>
              <div className="pan-foil" aria-hidden />
              {logo && <div className="pan-watermark" style={{ backgroundImage: `url(${logo})` }} aria-hidden />}
              <div className="pan-top">
                <TeamLogo name={club?.name || player.teamName} logoUrl={logo} size="sm" ringColor={c1} />
                <span className="pan-club-nm">{club?.name || player.teamName}</span>
              </div>
              <div className="pan-rating" style={{ color: rc, borderColor: rc }}>
                <span className="pan-rating-n">{rating}</span>
                <span className="pan-rating-l">OVR</span>
              </div>
              <div className="pan-id">
                <span className="pan-num">#{player.shirtNumber}</span>
                <span className="pan-name">{player.name}</span>
                <span className="pan-prof">{profileOf(att, def)}</span>
              </div>
              <svg className="pan-radar" viewBox={`0 0 ${SZ} ${SZ}`} aria-hidden>
                {[0.5, 1].map((f) => <polygon key={f} points={poly(AXES.map(() => f))} className="pan-ring" />)}
                {AXES.map((a, i) => { const [x, y] = pt(i, 1.12); return <text key={a.key} x={x} y={y} className="pan-axlbl" textAnchor="middle" dominantBaseline="middle">{a.label}</text> })}
                <polygon points={poly(fracs)} className="pan-poly" style={{ fill: rc, stroke: rc }} />
                {fracs.map((f, i) => { const [x, y] = pt(i, f); return <circle key={i} cx={x} cy={y} r={2} style={{ fill: rc }} /> })}
              </svg>
              <div className="pan-subs">
                <span className="pan-sub"><b style={{ color: pctColor(att / 100) }}>{att}</b> AANVAL</span>
                <span className="pan-sub"><b style={{ color: pctColor(def / 100) }}>{def}</b> VERDEDIGING</span>
              </div>
              <div className="pan-stats">
                {chips.map((c) => (
                  <div className="pan-stat" key={c.lbl}>
                    <span className="pan-stat-ic" aria-hidden>{c.ic}</span>
                    <span className="pan-stat-val">{c.val}</span>
                    <span className="pan-stat-lbl">{c.lbl}{c.sub ? <em> · {c.sub}</em> : null}</span>
                  </div>
                ))}
              </div>
              <div className="pan-foot">{reeksLabel} · 25/26 · PANINI</div>
            </div>
            <p className="pan-tip">Tip: maak een schermafbeelding om de sticker te delen.</p>
          </div>
        )
      })()}
    </div>
  )
}
