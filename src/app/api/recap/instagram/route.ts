import sharp from 'sharp'
import { getPayloadClient } from '@/lib/payload'
import { buildWeeklyRecapData } from '@/lib/weekly-recap-data'
import { renderWeeklyRecapDesign } from '@/lib/weekly-recap-design'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const fallback = {
  startIso: new Date().toISOString(), endIso: new Date().toISOString(), matches: 0, goals: 0,
  headline: 'Weekendoverzicht', results: [], team: null, players: [], climbers: [],
  stats: { visitors: 0, clubs: 0, goalThrows: 0, backThrows: 0 }, highlights: [],
  push: { title: 'Weekendoverzicht', body: '' },
} as any

export async function GET(request: Request) {
  const wantsDownload = new URL(request.url).searchParams.has('download')
  try {
    const payload = await getPayloadClient()
    const recap = await buildWeeklyRecapData(payload)
    const svg = renderWeeklyRecapDesign(recap)
    if (!wantsDownload) return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'no-store' } })
    const png = await sharp(Buffer.from(svg)).png().toBuffer()
    return new Response(png, { headers: { 'Content-Type': 'image/png', 'Content-Disposition': `attachment; filename="weekend-recap-${recap.startIso.slice(0, 10)}.png"`, 'Cache-Control': 'no-store' } })
  } catch {
    const svg = renderWeeklyRecapDesign(fallback)
    if (!wantsDownload) return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'no-store' } })
    const png = await sharp(Buffer.from(svg)).png().toBuffer()
    return new Response(png, { headers: { 'Content-Type': 'image/png', 'Content-Disposition': 'attachment; filename="weekend-recap.png"', 'Cache-Control': 'no-store' } })
  }
}
