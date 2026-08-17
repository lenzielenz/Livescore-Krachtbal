import { createReadStream } from 'fs'
import fs from 'fs/promises'
import path from 'path'
import { Readable } from 'stream'

import { resolveMediaDir } from '@/lib/media-dir'

export const dynamic = 'force-dynamic'

// Serveert een opgeslagen clip of matchvideo. Publiek leesbaar (de bestandsnaam is onraadbaar),
// zodat een telefoon de video via de link/QR kan openen en bewaren. Ondersteunt Range-verzoeken
// (206), wat mobiele videospelers (vooral iOS Safari) nodig hebben om vlot af te spelen/bewaren.
// Met ?download=1 (en optioneel ?name=…) wordt het een échte bestandsdownload (attachment):
// Android Chrome zet de video meteen in Downloads, iOS Safari toont de downloadmanager.
//
// We STREAMEN vanaf schijf (createReadStream met start/end) i.p.v. het bestand in te lezen. Bij een
// korte replay-clip scheelt dat al geheugen, maar bij een volledige matchvideo (video-analyse,
// honderden MB) is het noodzakelijk: een speler vuurt tijdens het scrubben tientallen
// Range-verzoeken af, en telkens het hele bestand inlezen legt de server plat.
export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  // Strikt: enkel onze eigen onraadbare bestandsnamen (geen path traversal).
  if (!/^[a-f0-9]{18}\.(mp4|webm)$/.test(file)) {
    return new Response('Niet gevonden', { status: 404 })
  }
  const full = path.join(resolveMediaDir(), 'clips', file)
  let total: number
  try {
    const st = await fs.stat(full)
    if (!st.isFile()) return new Response('Niet gevonden', { status: 404 })
    total = st.size
  } catch {
    return new Response('Niet gevonden', { status: 404 })
  }
  const ctype = file.endsWith('.mp4') ? 'video/mp4' : 'video/webm'

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

  const bodyOf = (start: number, end: number) =>
    Readable.toWeb(createReadStream(full, { start, end })) as unknown as ReadableStream<Uint8Array>

  const range = req.headers.get('range')
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range)
  if (m) {
    // "bytes=-500" = de laatste 500 bytes; "bytes=500-" = vanaf 500 tot het einde.
    const suffix = m[1] === '' && m[2] !== ''
    const start = suffix ? Math.max(0, total - parseInt(m[2], 10)) : parseInt(m[1] || '0', 10)
    const end = suffix || m[2] === '' ? total - 1 : Math.min(parseInt(m[2], 10), total - 1)
    if (!Number.isFinite(start) || start >= total || start > end) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } })
    }
    return new Response(bodyOf(start, end), {
      status: 206,
      headers: { ...baseHeaders, 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': String(end - start + 1) },
    })
  }

  return new Response(bodyOf(0, total - 1), { status: 200, headers: { ...baseHeaders, 'Content-Length': String(total) } })
}
