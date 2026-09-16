import sharp from 'sharp'
import { orderWeekendRows, renderWeekendDesign, weekendPages } from '@/lib/weekend-design'

import { userClubId } from '@/lib/access'
import { competitionWhere } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { brusselsDateKey, nextPlayDayKeys, planningSearchWindow, type WeekendMatch } from '@/lib/instagram-weekend'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const TZ = 'Europe/Brussels'

function nameOf(value: unknown): string {
  return value && typeof value === 'object' ? String((value as { name?: unknown }).name ?? '—') : '—'
}

function color(value: unknown, fallback: string): string {
  const input = String(value ?? '').trim()
  return /^#[0-9a-f]{6}$/i.test(input) ? input : fallback
}

function dateLabel(date: Date): string {
  return new Intl.DateTimeFormat('nl-BE', { timeZone: TZ, day: 'numeric', month: 'long' }).format(date)
}

function timeLabel(date: Date): string {
  return new Intl.DateTimeFormat('nl-BE', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date)
}

function dayLabel(date: Date): string {
  return new Intl.DateTimeFormat('nl-BE', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(date)
}

function weekendTitle(rows: WeekendMatch[], saturdayKey: string): string {
  if (rows.length) {
    const first = new Date(rows[0].date)
    const last = new Date(rows[rows.length - 1].date)
    if (brusselsDateKey(first) === brusselsDateKey(last)) return dateLabel(first)
    const a = new Intl.DateTimeFormat('nl-BE', { timeZone: TZ, day: 'numeric' }).format(first)
    return `${a} – ${dateLabel(last)}`
  }
  return dateLabel(new Date(`${saturdayKey}T12:00:00Z`))
}

async function fetchLogo(value: unknown, origin: string): Promise<Buffer | null> {
  const raw = value && typeof value === 'object'
    ? String((value as { url?: unknown }).url ?? '')
    : typeof value === 'string' ? value : ''
  if (!raw) return null
  try {
    const url = new URL(raw, origin)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    const response = await fetch(url, { signal: AbortSignal.timeout(4_000), cache: 'force-cache' })
    if (!response.ok) return null
    const declared = Number(response.headers.get('content-length') ?? 0)
    if (declared > 3_000_000) return null
    const bytes = Buffer.from(await response.arrayBuffer())
    return bytes.length <= 3_000_000 ? bytes : null
  } catch {
    return null
  }
}

async function renderWeekendPost(request: Request) {
  const user = await getAuthUser()
  if (!user) return Response.json({ error: 'Log eerst in.' }, { status: 401 })
  const clubId = userClubId(user)
  if (clubId == null) return Response.json({ error: 'Je account is niet aan een club gekoppeld.' }, { status: 403 })

  const payload = await getPayloadClient()
  const club = await payload.findByID({ collection: 'clubs', id: clubId, depth: 1 }).catch(() => null)
  if (!club) return Response.json({ error: 'Club niet gevonden.' }, { status: 404 })

  const teams = await payload.find({
    collection: 'teams',
    where: { and: [{ club: { equals: clubId } }, competitionWhere()] },
    depth: 0,
    limit: 500,
  }).catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const teamIds = teams.docs.map((team) => Number(team.id))
  const ownTeams = new Map(teams.docs.map((team) => [Number(team.id), String(team.name ?? 'Ploeg')]))
  const searchWindow = planningSearchWindow()

  const matches = teamIds.length
    ? await payload.find({
        collection: 'matches',
        where: {
          and: [
            { date: { greater_than_equal: searchWindow.queryStart.toISOString() } },
            { date: { less_than: searchWindow.queryEnd.toISOString() } },
            { or: [{ homeTeam: { in: teamIds } }, { awayTeam: { in: teamIds } }] },
            competitionWhere(),
          ],
        },
        sort: 'date',
        depth: 2,
        limit: 500,
      }).catch(() => ({ docs: [] as Record<string, unknown>[] }))
    : { docs: [] as Record<string, unknown>[] }

  const rows: WeekendMatch[] = []
  for (const match of matches.docs) {
    if ((match as { isDemo?: boolean }).isDemo || (match as { analyseOnly?: boolean }).analyseOnly) continue
    const date = new Date(String((match as { date?: unknown }).date ?? ''))
    if (!Number.isFinite(date.getTime())) continue
    const home = (match as { homeTeam?: unknown }).homeTeam
    const away = (match as { awayTeam?: unknown }).awayTeam
    const homeId = home && typeof home === 'object' ? Number((home as { id?: unknown }).id) : Number(home)
    const awayId = away && typeof away === 'object' ? Number((away as { id?: unknown }).id) : Number(away)
    const side = ownTeams.has(homeId) ? 'home' : 'away'
    const ownId = side === 'home' ? homeId : awayId
    const reeksRaw = String((match as { reeks?: unknown }).reeks ?? '')
    rows.push({
      id: Number((match as { id?: unknown }).id),
      date: date.toISOString(),
      time: timeLabel(date),
      day: dayLabel(date),
      side,
      team: ownTeams.get(ownId) ?? (side === 'home' ? nameOf(home) : nameOf(away)),
      opponent: side === 'home' ? nameOf(away) : nameOf(home),
      series: reeksNaam(reeksRaw as Parameters<typeof reeksNaam>[0]),
      seriesCode: reeksRaw || '—',
    })
  }

  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const playDayKeys = nextPlayDayKeys(rows.map((row) => row.date))
  const selectedRows = rows.filter((row) => playDayKeys.includes(brusselsDateKey(row.date)))
  const primary = color((club as { colorPrimary?: unknown }).colorPrimary, '#0f8a5f')
  const secondary = color((club as { colorSecondary?: unknown }).colorSecondary, '#f4c542')
  const clubName = String((club as { name?: unknown }).name ?? 'Krachtbalclub')
  const requestUrl = new URL(request.url)
  const orderedRows = orderWeekendRows(selectedRows)
  const pages = weekendPages(orderedRows)
  const homeCount = selectedRows.filter((row) => row.side === 'home').length
  const awayCount = selectedRows.filter((row) => row.side === 'away').length
  const rawPage = Number(requestUrl.searchParams.get('page') ?? 0)
  const page = Number.isInteger(rawPage) ? Math.max(0, Math.min(pages.length - 1, rawPage)) : 0
  if (requestUrl.searchParams.get('meta') === '1') {
    return Response.json({ pages: pages.length, total: selectedRows.length }, { headers: { 'Cache-Control': 'private, no-store' } })
  }
  const storedLogo = (club as { logo?: unknown }).logo
  const logoSource = storedLogo || (club as { logoUrl?: unknown }).logoUrl
  const logo = await fetchLogo(logoSource, requestUrl.origin)
  let logoHref = ''
  if (logo) {
    try {
      const badge = await sharp(logo).resize(400, 400, { fit: 'inside', withoutEnlargement: true }).png().toBuffer()
      logoHref = `data:image/png;base64,${badge.toString('base64')}`
    } catch {
      // An invalid logo falls back to initials in both preview and download.
    }
  }
  const fit = club as { logoZoom?: number; logoOffsetX?: number; logoOffsetY?: number }
  const svg = renderWeekendDesign({
    club: clubName, primary, secondary,
    title: weekendTitle(selectedRows, playDayKeys[0] ?? brusselsDateKey(new Date())),
    rows: pages[page], total: selectedRows.length, page, pages: pages.length,
    homeCount, awayCount,
    logoHref,
    logoFit: { zoom: fit.logoZoom, offsetX: fit.logoOffsetX, offsetY: fit.logoOffsetY },
  })
  return new Response(svg, { headers: {
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
  } })
}

// Nooit een SVG-met-tekst server-side naar PNG rasteren (sharp/librsvg heeft daarvoor fontconfig
// nodig; ontbreekt dat op de container, dan is het geen gewone fout maar een NATIVE crash die het
// hele Node-proces meesleurt — precies wat op 15/09 de site plat legde via de Winfie-route). De
// PNG die de gebruiker downloadt, tekent de browser zelf op een canvas (zie svg-to-png.ts) —
// enkel deze SVG-preview komt van de server.
async function fallbackSvg(): Promise<Response> {
  const svg = `<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#06140d"/><stop offset="1" stop-color="#123a2a"/></linearGradient></defs>
    <rect width="1080" height="1920" fill="url(#b)"/>
    <rect x="0" width="18" height="1920" fill="#4cc9f0"/>
    <text x="72" y="140" fill="#ffffff" font-size="34" font-family="sans-serif" font-weight="800">KRACHTBAL LIVE</text>
    <text x="72" y="430" fill="#4cc9f0" font-size="76" font-family="sans-serif" font-weight="900">WEEKENDPLAN</text>
    <text x="72" y="520" fill="#ffffff" font-size="35" font-family="sans-serif" font-weight="700">De voorvertoning wordt opnieuw opgebouwd.</text>
    <text x="72" y="580" fill="#ffffff" fill-opacity=".65" font-size="27" font-family="sans-serif">Probeer het zo meteen opnieuw.</text>
  </svg>`
  return new Response(svg, {
    status: 200,
    headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Weekendplan-Fallback': '1' },
  })
}

export async function GET(request: Request) {
  try {
    return await renderWeekendPost(request)
  } catch (error) {
    console.error('[instagram-weekend] Genereren mislukt', error)
    if (new URL(request.url).searchParams.get('meta') === '1') {
      return Response.json({ error: 'Kon niet worden opgebouwd.' }, { status: 500 })
    }
    return fallbackSvg()
  }
}
