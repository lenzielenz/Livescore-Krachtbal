import sharp from 'sharp'
import { getPayloadClient } from '@/lib/payload-client'
import { buildWeeklyRecapData } from '@/lib/weekly-recap-data'
import { renderWeeklyRecapDesign } from '@/lib/weekly-recap-design'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const wantsDownload = new URL(request.url).searchParams.has('download')
  try {
    const payload = await getPayloadClient()
    const recap = await buildWeeklyRecapData(payload)
    const svg = renderWeeklyRecapDesign(recap)
    if (!wantsDownload) return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'no-store' } })
    const png = await sharp(Buffer.from(svg)).png().toBuffer()
    return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Content-Disposition': `attachment; filename="weekend-recap-${recap.startIso.slice(0, 10)}.png"`, 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[weekendrecap] Story maken mislukt', error)
    return Response.json(
      { error: 'De weekendrecap kon niet worden gemaakt. Probeer het opnieuw.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
