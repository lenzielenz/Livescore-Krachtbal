import { randomBytes } from 'crypto'
import fs from 'fs/promises'
import path from 'path'

import { resolveMediaDir } from '@/lib/media-dir'

export const dynamic = 'force-dynamic'
// Genoeg ruimte voor een korte replay-clip (laagdrempelig, niet voor lange video's).
const MAX_BYTES = 60 * 1024 * 1024

// Bewaart een opgenomen replay-clip op de server en geeft een gewone URL terug. Zo kan je de video
// op je telefoon krijgen via een link/QR — wat betrouwbaarder werkt dan een blob-download (vooral op
// iOS). De clip krijgt een onraadbare naam; de opslag is tijdelijk (bedoeld om meteen te bewaren).
// Publiek: de replay-video staat ook op de publieke wedstrijdpagina (supporters), dus geen login.
export async function POST(req: Request) {
  const type = req.headers.get('content-type') || ''
  const ext = type.includes('mp4') ? 'mp4' : type.includes('webm') ? 'webm' : null
  if (!ext) return Response.json({ error: 'Enkel mp4/webm.' }, { status: 415 })

  const buf = Buffer.from(await req.arrayBuffer())
  if (buf.length === 0) return Response.json({ error: 'Lege video.' }, { status: 400 })
  if (buf.length > MAX_BYTES) return Response.json({ error: 'Video te groot.' }, { status: 413 })

  const id = randomBytes(9).toString('hex')
  const file = `${id}.${ext}`
  const dir = path.join(resolveMediaDir(), 'clips')
  try {
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, file), buf)
  } catch (err) {
    console.error('[clip] schrijven mislukt:', err)
    return Response.json({ error: 'Bewaren op de server mislukt.' }, { status: 500 })
  }
  return Response.json({ url: `/api/clip/${file}` })
}
