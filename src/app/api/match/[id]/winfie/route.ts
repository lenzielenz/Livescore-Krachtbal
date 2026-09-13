import sharp from 'sharp'

import { getAuthUser } from '@/lib/auth-user'
import { DEFAULT_HOME_COLOR, readableOnDark } from '@/lib/club-colors'
import { formatDateBE } from '@/lib/datetime'
import { buildMatchState, buildTimeline } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'
import { winfieHeadline, winfieProgress, winfieVariant } from '@/lib/winfie'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const W = 1080
const H = 1920

const esc = (v: unknown) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
const safeColor = (v: unknown, fallback: string) => /^#[0-9a-f]{6}$/i.test(String(v ?? '')) ? String(v) : fallback
const short = (v: string, max: number) => v.length <= max ? v : `${v.slice(0, max - 1).trimEnd()}…`
const initials = (v: string) => v.split(/\s+/).map((p) => p[0]).join('').slice(0, 3).toUpperCase()

async function imageBuffer(url: string | null, origin: string, max = 6_000_000): Promise<Buffer | null> {
  if (!url) return null
  try {
    const absolute = new URL(url, origin)
    if (!['http:', 'https:'].includes(absolute.protocol)) return null
    const response = await fetch(absolute, { signal: AbortSignal.timeout(5_000), cache: 'force-cache' })
    if (!response.ok || !String(response.headers.get('content-type')).startsWith('image/')) return null
    const declared = Number(response.headers.get('content-length') ?? 0)
    if (declared > max) return null
    const data = Buffer.from(await response.arrayBuffer())
    return data.length <= max ? data : null
  } catch {
    return null
  }
}

function chart(progress: ReturnType<typeof winfieProgress>, homeColor: string, awayColor: string) {
  const max = Math.max(1, ...progress.flatMap((p) => [p.home, p.away]))
  const count = Math.max(1, progress.length - 1)
  const point = (value: number, index: number) => {
    const x = 110 + (index / count) * 860
    const y = 1535 - (value / max) * 260
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }
  const home = progress.map((p, i) => point(p.home, i)).join(' ')
  const away = progress.map((p, i) => point(p.away, i)).join(' ')
  return `
    <rect x="72" y="1160" width="936" height="455" rx="42" fill="#050b08" fill-opacity=".78" stroke="#ffffff" stroke-opacity=".13"/>
    <text x="112" y="1225" fill="#ffffff" font-size="28" font-weight="850" letter-spacing="2">SCOREVERLOOP</text>
    <line x1="110" y1="1535" x2="970" y2="1535" stroke="#ffffff" stroke-opacity=".15" stroke-width="2"/>
    <polyline points="${home}" fill="none" stroke="${homeColor}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="${away}" fill="none" stroke="${awayColor}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="970" cy="${(1535 - (progress.at(-1)!.home / max) * 260).toFixed(1)}" r="15" fill="${homeColor}" stroke="#fff" stroke-width="4"/>
    <circle cx="970" cy="${(1535 - (progress.at(-1)!.away / max) * 260).toFixed(1)}" r="15" fill="${awayColor}" stroke="#fff" stroke-width="4"/>
  `
}

function overlaySvg(opts: {
  home: string; away: string; score: { home: number; away: number }; winner: 'home' | 'away' | 'draw'
  primary: string; secondary: string; homeColor: string; awayColor: string; headline: string
  date: string; reeks: string; progress: ReturnType<typeof winfieProgress>; variant: number; hasPhoto: boolean
  homeLogo: boolean; awayLogo: boolean
}) {
  const { home, away, score, winner, primary, secondary, homeColor, awayColor, headline, date, reeks, progress, variant, hasPhoto } = opts
  const tilt = [-14, 12, -8, 16][variant]
  const winnerName = winner === 'home' ? home : winner === 'away' ? away : 'Gelijkspel'
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="base" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${primary}"/><stop offset=".55" stop-color="#07120d"/><stop offset="1" stop-color="${secondary}"/></linearGradient>
      <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#020604" stop-opacity=".28"/><stop offset=".45" stop-color="#020604" stop-opacity=".62"/><stop offset="1" stop-color="#020604" stop-opacity=".96"/></linearGradient>
    </defs>
    ${hasPhoto ? '<rect width="1080" height="1920" fill="url(#shade)"/>' : '<rect width="1080" height="1920" fill="url(#base)"/>'}
    <g transform="rotate(${tilt} 900 250)" opacity=".16">
      <rect x="650" y="-180" width="220" height="820" rx="110" fill="#ffffff"/>
      <rect x="900" y="-180" width="54" height="820" rx="27" fill="${secondary}"/>
    </g>
    <rect x="0" y="0" width="18" height="1920" fill="${secondary}"/>
    <rect x="72" y="70" width="936" height="5" rx="3" fill="#ffffff" fill-opacity=".78"/>
    <text x="72" y="132" fill="#ffffff" font-size="28" font-weight="900" letter-spacing="4">KRACHTBAL <tspan fill="${secondary}">LIVE</tspan></text>
    <text x="1008" y="132" text-anchor="end" fill="#ffffff" fill-opacity=".72" font-size="24" font-weight="650">WINFIE · ${esc(date)}</text>

    <text x="72" y="275" fill="${secondary}" font-size="${headline.length > 25 ? 48 : 62}" font-weight="950" letter-spacing="-1">${esc(short(headline, 34))}</text>
    <text x="72" y="325" fill="#ffffff" fill-opacity=".72" font-size="24" font-weight="700" letter-spacing="2">${esc(reeks.toUpperCase())}</text>

    <rect x="72" y="410" width="936" height="560" rx="48" fill="#06100b" fill-opacity=".72" stroke="#ffffff" stroke-opacity=".14"/>
    <text x="540" y="505" text-anchor="middle" fill="#ffffff" fill-opacity=".62" font-size="25" font-weight="750">EINDSTAND</text>
    ${opts.homeLogo ? '' : `<circle cx="250" cy="650" r="92" fill="${homeColor}" fill-opacity=".25" stroke="${homeColor}" stroke-width="5"/><text x="250" y="668" text-anchor="middle" fill="#ffffff" font-size="49" font-weight="900">${esc(initials(home))}</text>`}
    ${opts.awayLogo ? '' : `<circle cx="830" cy="650" r="92" fill="${awayColor}" fill-opacity=".25" stroke="${awayColor}" stroke-width="5"/><text x="830" y="668" text-anchor="middle" fill="#ffffff" font-size="49" font-weight="900">${esc(initials(away))}</text>`}
    <text x="540" y="675" text-anchor="middle" fill="#ffffff" font-size="145" font-weight="950" letter-spacing="-5">${score.home}<tspan fill="#ffffff" fill-opacity=".38" font-weight="500"> – </tspan>${score.away}</text>
    <text x="250" y="805" text-anchor="middle" fill="${winner === 'home' ? secondary : '#ffffff'}" font-size="30" font-weight="850">${esc(short(home, 20))}</text>
    <text x="830" y="805" text-anchor="middle" fill="${winner === 'away' ? secondary : '#ffffff'}" font-size="30" font-weight="850">${esc(short(away, 20))}</text>
    <rect x="332" y="866" width="416" height="58" rx="29" fill="${primary}"/>
    <text x="540" y="905" text-anchor="middle" fill="#ffffff" font-size="24" font-weight="900" letter-spacing="2">${esc(short(winnerName.toUpperCase(), 28))}</text>

    ${chart(progress, homeColor, awayColor)}
    <circle cx="112" cy="1687" r="9" fill="${homeColor}"/><text x="137" y="1695" fill="#ffffff" fill-opacity=".72" font-size="23">${esc(short(home, 23))}</text>
    <circle cx="570" cy="1687" r="9" fill="${awayColor}"/><text x="595" y="1695" fill="#ffffff" fill-opacity=".72" font-size="23">${esc(short(away, 23))}</text>

    <rect x="72" y="1790" width="936" height="1" fill="#ffffff" fill-opacity=".24"/>
    <text x="72" y="1845" fill="#ffffff" font-size="24" font-weight="850">DEEL DE OVERWINNING</text>
    <text x="1008" y="1845" text-anchor="end" fill="#ffffff" fill-opacity=".76" font-size="23" font-weight="750">krachtbal.live</text>
  </svg>`
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) return Response.json({ error: 'Ongeldige wedstrijd.' }, { status: 400 })

  const payload = await getPayloadClient()
  const [state, timeline, match, user] = await Promise.all([
    buildMatchState(payload, matchId).catch(() => null),
    buildTimeline(payload, matchId).catch(() => []),
    payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null),
    getAuthUser(),
  ])
  if (!state || !match || match.analyseOnly) return Response.json({ error: 'Wedstrijd niet gevonden.' }, { status: 404 })
  if (state.match.status !== 'finished') return Response.json({ error: 'De Winfie verschijnt na de eindstand.' }, { status: 409 })

  let photoDoc: { id?: number; filename?: string | null; url?: string | null } | null = null
  if (user) {
    const photos = await payload.find({
      collection: 'match-instants',
      where: { and: [{ match: { equals: matchId } }, { author: { equals: user.id } }] },
      sort: '-createdAt',
      depth: 0,
      limit: 1,
    }).catch(() => null)
    photoDoc = (photos?.docs?.[0] as typeof photoDoc) ?? null
  }

  const origin = new URL(request.url).origin
  const photoUrl = photoDoc?.filename ? `/api/match-instants/file/${encodeURIComponent(photoDoc.filename)}` : (photoDoc?.url ?? null)
  const [photo, homeLogo, awayLogo] = await Promise.all([
    imageBuffer(photoUrl, origin),
    imageBuffer(state.teams.home.logoUrl, origin, 2_000_000),
    imageBuffer(state.teams.away.logoUrl, origin, 2_000_000),
  ])

  const winner = state.score.home > state.score.away ? 'home' : state.score.away > state.score.home ? 'away' : 'draw'
  const winningColors = winner === 'home' ? state.teams.home.colors : winner === 'away' ? state.teams.away.colors : null
  const primary = safeColor(winningColors?.primary, '#0f8a5f')
  const secondary = readableOnDark(safeColor(winningColors?.secondary, '#d8b44b'))
  const homeColor = readableOnDark(safeColor(state.teams.home.colors?.primary, DEFAULT_HOME_COLOR))
  const awayColor = readableOnDark(safeColor(state.teams.away.colors?.primary, '#4cc9f0'))
  const date = match.date ? formatDateBE(new Date(String(match.date)), { day: '2-digit', month: 'long', year: 'numeric' }) : ''
  const series = match.reeks ? reeksNaam(match.reeks) : 'Krachtbal'
  const progress = winfieProgress(timeline)
  const last = progress.at(-1)
  // Ook een geïmporteerde/handmatig bevestigde eindstand zonder volledige doelpuntentijdlijn
  // eindigt correct in de grafiek.
  if (!last || last.home !== state.score.home || last.away !== state.score.away) {
    progress.push({ home: state.score.home, away: state.score.away, half: 2, gameClock: 0 })
  }
  const svg = overlaySvg({
    home: state.teams.home.name,
    away: state.teams.away.name,
    score: state.score,
    winner,
    primary,
    secondary,
    homeColor,
    awayColor,
    headline: winfieHeadline(state.teams.home.name, state.teams.away.name, state.score),
    date,
    reeks: series,
    progress,
    variant: winfieVariant(matchId, Number(photoDoc?.id) || 0),
    hasPhoto: Boolean(photo),
    homeLogo: Boolean(homeLogo),
    awayLogo: Boolean(awayLogo),
  })

  let canvas = photo
    ? sharp(photo).resize(W, H, { fit: 'cover', position: sharp.strategy.attention }).modulate({ saturation: 0.82, brightness: 0.72 })
    : sharp({ create: { width: W, height: H, channels: 4, background: primary } })

  const composites: sharp.OverlayOptions[] = [{ input: Buffer.from(svg), left: 0, top: 0 }]
  if (homeLogo) {
    const logo = await sharp(homeLogo).resize(174, 174, { fit: 'contain' }).png().toBuffer().catch(() => null)
    if (logo) composites.push({ input: logo, left: 163, top: 563 })
  }
  if (awayLogo) {
    const logo = await sharp(awayLogo).resize(174, 174, { fit: 'contain' }).png().toBuffer().catch(() => null)
    if (logo) composites.push({ input: logo, left: 743, top: 563 })
  }

  canvas = canvas.composite(composites)
  const png = await canvas.png({ compressionLevel: 9 }).toBuffer()
  const slug = `${state.teams.home.name}-${state.teams.away.name}`.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')
  const download = new URL(request.url).searchParams.get('download') === '1'
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="winfie-${slug}.png"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
