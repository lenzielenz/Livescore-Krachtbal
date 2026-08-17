import { execFile } from 'child_process'
import { randomBytes } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { promisify } from 'util'

import ffmpegPath from 'ffmpeg-static'

import { resolveMediaDir } from '@/lib/media-dir'
import { clientIp, rateLimit } from '@/lib/sse-hub'

export const dynamic = 'force-dynamic'
// Genoeg ruimte voor een korte replay-clip (laagdrempelig, niet voor lange video's).
const MAX_BYTES = 60 * 1024 * 1024

const run = promisify(execFile)

// webm → mp4 (H.264): mp4 kan je overal downloaden, afspelen en doorsturen (WhatsApp lust geen
// webm). Toestellen waarvan de eigen mp4-encoder kapot is, nemen webm op — de server zet het om.
// Best-effort: lukt de conversie niet (binary ontbreekt, kapotte invoer), dan blijft de webm staan.
async function webmNaarMp4(dir: string, webmFile: string): Promise<string | null> {
  if (!ffmpegPath) return null
  const src = path.join(dir, webmFile)
  const out = webmFile.replace(/\.webm$/, '.mp4')
  const dst = path.join(dir, out)
  try {
    await fs.access(ffmpegPath)
    await run(
      ffmpegPath,
      [
        '-y',
        '-i', src,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        // H.264 vereist even afmetingen; canvas-clips kunnen oneven hoog zijn.
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-movflags', '+faststart',
        '-an',
        dst,
      ],
      { timeout: 90_000 },
    )
    const st = await fs.stat(dst)
    if (st.size === 0) throw new Error('lege mp4')
    await fs.unlink(src).catch(() => {})
    return out
  } catch (err) {
    console.error('[clip] webm→mp4 mislukt:', err)
    await fs.unlink(dst).catch(() => {})
    return null
  }
}

// Bewaart een opgenomen replay-clip op de server en geeft een gewone URL terug. Zo kan je de video
// op je telefoon krijgen via een link/QR — wat betrouwbaarder werkt dan een blob-download (vooral op
// iOS). De clip krijgt een onraadbare naam; de opslag is tijdelijk (bedoeld om meteen te bewaren).
// Publiek: de replay-video staat ook op de publieke wedstrijdpagina (supporters), dus geen login.
export async function POST(req: Request) {
  // Bewust zonder login (supporters delen een replay vanaf de publieke wedstrijdpagina), maar wél
  // begrensd: elke upload kost schijf én een ffmpeg-conversie. Zonder deze rem is dit een open
  // CPU-/opslagkraan voor het hele internet.
  if (!rateLimit(`clip:${clientIp(req)}`, 5, 60_000)) {
    return Response.json({ error: 'Te veel clips na elkaar — probeer zo dadelijk opnieuw.' }, { status: 429 })
  }

  const type = req.headers.get('content-type') || ''
  const ext = type.includes('mp4') ? 'mp4' : type.includes('webm') ? 'webm' : null
  if (!ext) return Response.json({ error: 'Enkel mp4/webm.' }, { status: 415 })

  const buf = Buffer.from(await req.arrayBuffer())
  if (buf.length === 0) return Response.json({ error: 'Lege video.' }, { status: 400 })
  if (buf.length > MAX_BYTES) return Response.json({ error: 'Video te groot.' }, { status: 413 })

  const id = randomBytes(9).toString('hex')
  let file = `${id}.${ext}`
  const dir = path.join(resolveMediaDir(), 'clips')
  try {
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, file), buf)
  } catch (err) {
    console.error('[clip] schrijven mislukt:', err)
    return Response.json({ error: 'Bewaren op de server mislukt.' }, { status: 500 })
  }

  // webm omzetten naar mp4 zodat de download overal werkt; mislukt het, dan blijft de webm.
  if (ext === 'webm') {
    const mp4 = await webmNaarMp4(dir, file)
    if (mp4) file = mp4
  }

  return Response.json({ url: `/api/clip/${file}` })
}
