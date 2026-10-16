import { createReadStream } from 'fs'
import fs from 'fs/promises'
import path from 'path'
import { Readable } from 'stream'

import { canViewAnalyseMatch } from '@/lib/analyse-access'
import { authUser } from '@/lib/api-auth'
import {
  appMap,
  geldigBestand,
  handtekeningGeldig,
  inhoudSoort,
  leesManifest,
  leesRange,
  ondertekendeUrl,
} from '@/lib/app-analyse'
import { getPayloadClient } from '@/lib/payload-client'

export const dynamic = 'force-dynamic'

// Serveert een bestand uit het analysepakket van de app (src/lib/app-analyse.ts).
//
// Toegang: wie de analysewedstrijd mag zien (sessie), of een geldige ondertekende link — die
// gebruikt het wedstrijdcentrum, dat in een afgeschermd iframe zonder cookies draait.
// Video's met Range-verzoeken (206), anders kan je in de speler niet springen.
// HTML (het wedstrijdcentrum, de coachanalyse) krijgt een CSP-sandbox: eigen scripts mogen
// draaien, maar zonder toegang tot de site (geen cookies, geen API's met jouw sessie). Bovenaan
// krijgt het `window.KB_SITE` mee: alleen-lezen, en ondertekende links naar de video en de andere
// bestanden van dit pakket.

const HTML_CSP = 'sandbox allow-scripts allow-popups allow-downloads allow-modals'

export async function GET(req: Request, { params }: { params: Promise<{ id: string; bestand: string }> }) {
  const { id, bestand } = await params
  const matchId = Number(id)
  if (!Number.isInteger(matchId) || !geldigBestand(bestand)) return new Response('Niet gevonden', { status: 404 })

  const url = new URL(req.url)
  let mag = handtekeningGeldig(matchId, bestand, url.searchParams.get('tot'), url.searchParams.get('sig'))
  if (!mag) {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
    mag =
      Boolean(user) &&
      Boolean((match as { analyseOnly?: boolean | null } | null)?.analyseOnly) &&
      canViewAnalyseMatch(user, match as { analyseOnly?: boolean | null; analyseOwner?: unknown })
  }
  if (!mag) return new Response('Geen toegang', { status: 403 })

  const vol = path.join(appMap(matchId), bestand)
  const st = await fs.stat(vol).catch(() => null)
  if (!st?.isFile()) return new Response('Niet gevonden', { status: 404 })
  const download = url.searchParams.get('download') === '1'
  const kop: Record<string, string> = {
    'Content-Type': inhoudSoort(bestand),
    'Cache-Control': 'private, max-age=300',
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${bestand}"`,
    'X-Content-Type-Options': 'nosniff',
  }

  if (bestand.endsWith('.html')) {
    const manifest = await leesManifest(matchId)
    const namen = (manifest?.bestanden ?? []).map((b) => b.naam)
    const site = {
      alleenLezen: true,
      video: namen.includes('video.mp4') ? ondertekendeUrl(matchId, 'video.mp4') : null,
      bestanden: Object.fromEntries(namen.map((n) => [n, ondertekendeUrl(matchId, n)])),
    }
    const inleiding = `<script>window.KB_SITE=${JSON.stringify(site).replace(/</g, '\\u003c')};</script>`
    const html = await fs.readFile(vol, 'utf8')
    const metKop = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + inleiding) : inleiding + html
    return new Response(metKop, {
      headers: { ...kop, 'Cache-Control': 'private, no-store', 'Content-Security-Policy': HTML_CSP },
    })
  }

  const body = (start: number, einde: number) =>
    Readable.toWeb(createReadStream(vol, { start, end: einde })) as unknown as ReadableStream<Uint8Array>
  const bereik = leesRange(req.headers.get('range'), st.size)
  if (bereik === 'buiten') return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${st.size}` } })
  if (bereik) {
    return new Response(body(bereik.start, bereik.einde), {
      status: 206,
      headers: {
        ...kop,
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${bereik.start}-${bereik.einde}/${st.size}`,
        'Content-Length': String(bereik.einde - bereik.start + 1),
      },
    })
  }
  return new Response(body(0, st.size - 1), {
    headers: { ...kop, 'Accept-Ranges': 'bytes', 'Content-Length': String(st.size) },
  })
}
