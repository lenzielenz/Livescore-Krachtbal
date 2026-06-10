import fs from 'fs/promises'
import path from 'path'

import { resolveMediaDir } from '@/lib/media-dir'

export const dynamic = 'force-dynamic'

// Serveert een opgeslagen replay-clip. Publiek leesbaar (de bestandsnaam is onraadbaar), zodat een
// telefoon de video via de link/QR kan openen en bewaren. Ondersteunt Range-verzoeken (206), wat
// mobiele videospelers (vooral iOS Safari) nodig hebben om vlot af te spelen/bewaren.
// Met ?download=1 (en optioneel ?name=…) wordt het een échte bestandsdownload (attachment):
// Android Chrome zet de video meteen in Downloads, iOS Safari toont de downloadmanager.
export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  // Strikt: enkel onze eigen onraadbare bestandsnamen (geen path traversal).
  if (!/^[a-f0-9]{18}\.(mp4|webm)$/.test(file)) {
    return new Response('Niet gevonden', { status: 404 })
  }
  const full = path.join(resolveMediaDir(), 'clips', file)
  let data: Buffer
  try {
    data = await fs.readFile(full)
  } catch {
    return new Response('Niet gevonden', { status: 404 })
  }
  const ctype = file.endsWith('.mp4') ? 'video/mp4' : 'video/webm'
  const total = data.length

  // Downloadnaam: strikt opgeschoond, en altijd met de échte extensie van het bestand.
  const url = new URL(req.url)
  const asDownload = url.searchParams.get('download') === '1'
  const ext = file.endsWith('.mp4') ? 'mp4' : 'webm'
  const rawName = (url.searchParams.get('name') ?? '').replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 80)
  const base = rawName.replace(/\.(mp4|webm)$/i, '') || `krachtbal-replay`
  const filename = `${base}.${ext}`

  const baseHeaders: Record<string, string> = {
    'Content-Type': ctype,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=86400',
    'Content-Disposition': `${asDownload ? 'attachment' : 'inline'}; filename="${asDownload ? filename : file}"`,
  }

  const range = req.headers.get('range')
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range)
  if (m) {
    const start = m[1] ? parseInt(m[1], 10) : 0
    const end = m[2] ? parseInt(m[2], 10) : total - 1
    if (start >= total || end >= total || start > end) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } })
    }
    const chunk = new Uint8Array(data.subarray(start, end + 1))
    return new Response(chunk, {
      status: 206,
      headers: { ...baseHeaders, 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': String(chunk.length) },
    })
  }

  return new Response(new Uint8Array(data), { status: 200, headers: { ...baseHeaders, 'Content-Length': String(total) } })
}
