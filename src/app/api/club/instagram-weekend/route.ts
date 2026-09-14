import sharp from 'sharp'

import { userClubId } from '@/lib/access'
import { competitionWhere } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { brusselsDateKey, nextPlayDayKeys, planningSearchWindow, type WeekendMatch } from '@/lib/instagram-weekend'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const WIDTH = 1080
const HEIGHT = 1920
const TZ = 'Europe/Brussels'

function xml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function nameOf(value: unknown): string {
  return value && typeof value === 'object' ? String((value as { name?: unknown }).name ?? '—') : '—'
}

function short(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(1, max - 1)).trimEnd()}…`
}

function initials(value: string): string {
  return value.split(/\s+/).map((part) => part[0]).join('').slice(0, 3).toUpperCase()
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

function makeSvg(clubName: string, primary: string, secondary: string, rows: WeekendMatch[], saturdayKey: string, hasLogo: boolean, logoHref = '') {
  const groups = new Map<string, WeekendMatch[]>()
  for (const row of rows) {
    const key = row.day
    groups.set(key, [...(groups.get(key) ?? []), row])
  }

  const dense = rows.length > 16
  const compact = rows.length > 11
  const rowHeight = dense ? 58 : compact ? 78 : 105
  const groupGap = dense ? 18 : compact ? 30 : 50
  const titleSize = dense ? 24 : compact ? 29 : 34
  const timeSize = dense ? 25 : compact ? 31 : 39
  const matchSize = dense ? 21 : compact ? 25 : 31
  const seriesSize = dense ? 15 : compact ? 19 : 22
  const badgeWidth = dense ? 98 : 118
  let y = dense ? 520 : 555
  const sections: string[] = []

  if (!rows.length) {
    sections.push(`
      <rect x="72" y="570" width="936" height="300" rx="36" fill="#ffffff" fill-opacity=".08" stroke="#ffffff" stroke-opacity=".14"/>
      <text x="540" y="690" text-anchor="middle" fill="#ffffff" font-size="42" font-weight="800">Geen wedstrijden gepland</text>
      <text x="540" y="750" text-anchor="middle" fill="#ffffff" fill-opacity=".7" font-size="27">Geniet van het vrije weekend.</text>
    `)
  } else {
    for (const [day, matches] of groups) {
      sections.push(`<text x="76" y="${y}" fill="#ffffff" fill-opacity=".72" font-size="${titleSize}" font-weight="700" letter-spacing="1">${xml(day.toUpperCase())}</text>`)
      y += dense ? 28 : 34
      for (const match of matches) {
        const ownFirst = match.side === 'home'
        const line = ownFirst ? `${match.team} — ${match.opponent}` : `${match.opponent} — ${match.team}`
        const badge = match.side === 'home' ? 'THUIS' : 'UIT'
        const centerY = y + (rowHeight - 8) / 2
        const badgeX = dense ? 220 : 245
        const textX = dense ? 342 : 392
        sections.push(`
          <rect x="72" y="${y}" width="936" height="${rowHeight - 8}" rx="${dense ? 18 : 24}" fill="#050d09" fill-opacity=".72" stroke="#ffffff" stroke-opacity=".13"/>
          <text x="102" y="${centerY + timeSize * .35}" fill="#ffffff" font-size="${timeSize}" font-weight="850" font-variant-numeric="tabular-nums">${xml(match.time)}</text>
          <rect x="${badgeX}" y="${centerY - (dense ? 17 : 21.5)}" width="${badgeWidth}" height="${dense ? 34 : 43}" rx="${dense ? 17 : 21.5}" fill="${match.side === 'home' ? primary : secondary}"/>
          <text x="${badgeX + badgeWidth / 2}" y="${centerY + (dense ? 6 : 7)}" text-anchor="middle" fill="#ffffff" font-size="${dense ? 15 : 19}" font-weight="900" letter-spacing="1">${badge}</text>
          <text x="${textX}" y="${centerY - (dense ? 2 : 7)}" fill="#ffffff" font-size="${matchSize}" font-weight="750">${xml(short(line, dense ? 46 : compact ? 38 : 31))}</text>
          <text x="${textX}" y="${centerY + (dense ? 17 : 22)}" fill="#ffffff" fill-opacity=".62" font-size="${seriesSize}" font-weight="600">${xml(short(match.series, 42))}</text>
        `)
        y += rowHeight
      }
      y += groupGap
    }
  }

  return `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#06140d"/><stop offset=".52" stop-color="${primary}"/><stop offset="1" stop-color="#07120d"/></linearGradient>
      <radialGradient id="glow"><stop stop-color="${secondary}" stop-opacity=".78"/><stop offset="1" stop-color="${secondary}" stop-opacity="0"/></radialGradient>
      <filter id="shadow"><feGaussianBlur stdDeviation="28"/></filter>
    </defs>
    <rect width="1080" height="1920" fill="url(#bg)"/>
    <circle cx="930" cy="160" r="420" fill="url(#glow)" opacity=".55"/>
    <circle cx="930" cy="220" r="230" fill="none" stroke="#ffffff" stroke-opacity=".08" stroke-width="34"/>
    <path d="M770 55 Q930 215 1085 75 M725 238 Q920 330 1080 242 M880 -5 Q820 205 915 430" fill="none" stroke="#ffffff" stroke-opacity=".08" stroke-width="21"/>
    <rect x="0" y="0" width="18" height="1920" fill="${secondary}"/>
    <rect x="72" y="70" width="936" height="5" rx="3" fill="#ffffff" fill-opacity=".74"/>
    ${logoHref ? `<circle cx="139" cy="168" r="72" fill="#ffffff" fill-opacity=".96"/><image href="${xml(logoHref)}" x="75" y="104" width="128" height="128" preserveAspectRatio="xMidYMid meet"/>` : hasLogo ? '' : `<circle cx="139" cy="168" r="66" fill="#ffffff" fill-opacity=".12" stroke="#ffffff" stroke-opacity=".3" stroke-width="3"/><text x="139" y="181" text-anchor="middle" fill="#ffffff" font-size="35" font-weight="900">${xml(initials(clubName))}</text>`}
    <text x="230" y="153" fill="#ffffff" fill-opacity=".70" font-size="25" font-weight="700" letter-spacing="3">MIJN KRACHTBAL</text>
    <text x="230" y="202" fill="#ffffff" font-size="39" font-weight="900">${xml(short(clubName, 28))}</text>
    <text x="72" y="350" fill="${secondary}" font-size="76" font-weight="900" letter-spacing="-2">WEEKENDPLAN</text>
    <text x="76" y="405" fill="#ffffff" font-size="34" font-weight="650">${xml(weekendTitle(rows, saturdayKey))}</text>
    <text x="76" y="468" fill="#ffffff" fill-opacity=".60" font-size="24" font-weight="600">${rows.length} ${rows.length === 1 ? 'wedstrijd' : 'wedstrijden'} · alle ploegen van de club</text>
    ${sections.join('')}
    <rect x="72" y="1790" width="936" height="1" fill="#ffffff" fill-opacity=".22"/>
    <text x="72" y="1840" fill="#ffffff" fill-opacity=".72" font-size="23" font-weight="650">Volg de scores live op Krachtbal Live</text>
    <text x="1008" y="1840" text-anchor="end" fill="#ffffff" font-size="23" font-weight="850">krachtbal.live</text>
  </svg>`
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
    rows.push({
      id: Number((match as { id?: unknown }).id),
      date: date.toISOString(),
      time: timeLabel(date),
      day: dayLabel(date),
      side,
      team: ownTeams.get(ownId) ?? (side === 'home' ? nameOf(home) : nameOf(away)),
      opponent: side === 'home' ? nameOf(away) : nameOf(home),
      series: reeksNaam(String((match as { reeks?: unknown }).reeks ?? '') as Parameters<typeof reeksNaam>[0]),
    })
  }

  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const playDayKeys = nextPlayDayKeys(rows.map((row) => row.date))
  const selectedRows = rows.filter((row) => playDayKeys.includes(brusselsDateKey(row.date)))
  const primary = color((club as { colorPrimary?: unknown }).colorPrimary, '#0f8a5f')
  const secondary = color((club as { colorSecondary?: unknown }).colorSecondary, '#f4c542')
  const clubName = String((club as { name?: unknown }).name ?? 'Krachtbalclub')
  const requestUrl = new URL(request.url)
  const preview = requestUrl.searchParams.get('preview') === '1'
  const storedLogo = (club as { logo?: unknown }).logo
  const logoSource = storedLogo || (club as { logoUrl?: unknown }).logoUrl
  // De inline voorvertoning blijft bewust SVG: geen zware PNG-compressie tijdens elke paginalaad.
  // Voor de download halen we het clublogo op en maken we wel de gevraagde 1080 × 1920 PNG.
  const logoHref = logoSource && typeof logoSource === 'object'
    ? String((logoSource as { url?: unknown }).url ?? '')
    : typeof logoSource === 'string' ? logoSource : ''
  const logo = preview ? null : await fetchLogo(logoSource, requestUrl.origin)
  const svg = makeSvg(
    clubName,
    primary,
    secondary,
    selectedRows,
    playDayKeys[0] ?? brusselsDateKey(new Date()),
    Boolean(logo),
    preview ? logoHref : '',
  )
  if (preview) {
    const previewSvg = svg.replace(
      `<svg width="${WIDTH}" height="${HEIGHT}"`,
      `<svg width="100%" height="100%" style="background:${primary}" preserveAspectRatio="xMidYMin meet"`,
    )
    return new Response(previewSvg, {
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }

  let image = sharp(Buffer.from(svg)).png({ compressionLevel: 7 })
  if (logo) {
    try {
      const badge = await sharp(logo).resize(132, 132, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer()
      image = image.composite([{ input: badge, left: 73, top: 102 }])
    } catch {
      // Een onleesbaar logo mag de weekpost nooit blokkeren.
    }
  }
  const png = await image.toBuffer()
  const disposition = requestUrl.searchParams.get('download') === '1' ? 'attachment' : 'inline'
  const filename = `weekendplan-${clubName.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'club'}.png`
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `${disposition}; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}


async function fallbackPng(): Promise<Response> {
  const fallback = `<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#06140d"/><stop offset="1" stop-color="#123a2a"/></linearGradient></defs>
    <rect width="1080" height="1920" fill="url(#b)"/>
    <rect x="0" width="18" height="1920" fill="#4cc9f0"/>
    <text x="72" y="140" fill="#ffffff" font-size="34" font-family="sans-serif" font-weight="800">KRACHTBAL LIVE</text>
    <text x="72" y="430" fill="#4cc9f0" font-size="76" font-family="sans-serif" font-weight="900">WEEKENDPLAN</text>
    <text x="72" y="520" fill="#ffffff" font-size="35" font-family="sans-serif" font-weight="700">De voorvertoning wordt opnieuw opgebouwd.</text>
    <text x="72" y="580" fill="#ffffff" fill-opacity=".65" font-size="27" font-family="sans-serif">Probeer de downloadknop zo meteen opnieuw.</text>
  </svg>`
  const png = await sharp(Buffer.from(fallback)).png().toBuffer()
  return new Response(new Uint8Array(png), {
    status: 200,
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store', 'X-Weekendplan-Fallback': '1' },
  })
}

export async function GET(request: Request) {
  try {
    return await renderWeekendPost(request)
  } catch (error) {
    console.error('[instagram-weekend] Genereren mislukt', error)
    if (new URL(request.url).searchParams.get('preview') === '1') {
      return Response.json({ error: 'Voorvertoning kon niet worden opgebouwd.' }, { status: 500 })
    }
    try {
      return await fallbackPng()
    } catch (fallbackError) {
      console.error('[instagram-weekend] Noodafbeelding mislukt', fallbackError)
      return Response.json({ error: 'Weekendplan kon niet worden opgebouwd.' }, { status: 500 })
    }
  }
}
