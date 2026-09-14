import sharp from 'sharp'
import { renderWinfieDesign, type WinfieDesign } from '@/lib/winfie-design'

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

const safeColor = (v: unknown, fallback: string) => /^#[0-9a-f]{6}$/i.test(String(v ?? '')) ? String(v) : fallback

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

  type PhotoDoc = { id: number; filename?: string | null; url?: string | null }
  let photoDoc: PhotoDoc | null = null
  if (user) {
    const photos = await payload.find({
      collection: 'match-instants',
      where: { and: [{ match: { equals: matchId } }, { author: { equals: user.id } }] },
      sort: '-createdAt',
      depth: 0,
      limit: 1,
    }).catch(() => null)
    photoDoc = (photos?.docs?.[0] as unknown as PhotoDoc | undefined) ?? null
  }

  const requestUrl = new URL(request.url)
  const preview = requestUrl.searchParams.get('preview') === '1'
  const origin = requestUrl.origin
  const photoUrl = photoDoc?.filename ? `/api/match-instants/file/${encodeURIComponent(photoDoc.filename)}` : (photoDoc?.url ?? null)
  // Both sizes use embedded, decoded assets: an SVG displayed in an img element cannot
  // reliably load external club logos. The preview must match the downloadable artwork.
  const [photo, homeLogo, awayLogo] = await Promise.all([
    imageBuffer(photoUrl, origin),
    imageBuffer(state.teams.home.logoUrl, origin, 2_000_000),
    imageBuffer(state.teams.away.logoUrl, origin, 2_000_000),
  ])
  const asImage = async (data: Buffer | null, width: number, height: number, photo = false) => {
    if (!data) return undefined
    try {
      const png = await sharp(data).rotate().resize(width, height, {
        fit: photo ? 'cover' : 'inside',
        ...(photo ? { position: sharp.strategy.attention } : {}),
      }).png().toBuffer()
      return 'data:image/png;base64,' + png.toString('base64')
    } catch { return undefined }
  }
  const [photoHref, homeLogoHref, awayLogoHref] = await Promise.all([
    asImage(photo, 952, 296, true), asImage(homeLogo, 600, 600), asImage(awayLogo, 600, 600),
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
  const design: WinfieDesign = {
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
    photoHref,
    homeLogoHref,
    awayLogoHref,
    homeLogoFit: state.teams.home.logoFit,
    awayLogoFit: state.teams.away.logoFit,
  }

  const renderPng = (artwork: string) => sharp(Buffer.from(artwork))
    .resize(preview ? 540 : W, preview ? 960 : H)
    .flatten({ background: '#080d15' })
    .png({ compressionLevel: 7 })
    .toBuffer()

  // Eén vreemd of beschadigd uploadbestand mag nooit de hele Winfie blokkeren.
  // Als een eigen foto of clublogo niet kan worden verwerkt, wordt dezelfde
  // compositie opnieuw gemaakt met veilige initialen en wedstrijdcijfers.
  let png: Buffer
  try {
    png = await renderPng(renderWinfieDesign(design))
  } catch (error) {
    console.error('[winfie] render with assets failed, using safe artwork', error)
    png = await renderPng(renderWinfieDesign({
      ...design,
      photoHref: undefined,
      homeLogoHref: undefined,
      awayLogoHref: undefined,
    }))
  }
  const slug = `${state.teams.home.name}-${state.teams.away.name}`.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')
  const download = requestUrl.searchParams.get('download') === '1'
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="winfie-${slug}.png"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
