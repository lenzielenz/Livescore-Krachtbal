import { createWriteStream } from 'fs'
import { randomBytes } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'

import { authUser } from '@/lib/api-auth'
import { resolveMediaDir } from '@/lib/media-dir'
import { getPayloadClient } from '@/lib/payload-client'
import { clientIp, rateLimit } from '@/lib/sse-hub'
import { mayEditMatchVideo } from '@/lib/video-access'

export const dynamic = 'force-dynamic'

/** Maximale grootte van een matchvideo. Een volledige wedstrijd in redelijke kwaliteit past hier
 *  ruim in; groter hoort op YouTube (dat kan je gewoon linken). Instelbaar per omgeving, want de
 *  opslag is een Railway-volume dat geld kost. */
const MAX_MB = Number(process.env.MAX_MATCH_VIDEO_MB) || 512
const MAX_BYTES = MAX_MB * 1024 * 1024

// Upload van de volledige matchvideo voor de video-analyse. Bewust géén conversie (dat zou op een
// wedstrijd van een uur minutenlang CPU vreten): de browser speelt mp4/webm rechtstreeks af, en de
// serveerroute doet Range-verzoeken. We STREAMEN naar schijf i.p.v. het bestand in het geheugen te
// laden — anders houdt één upload honderden MB's RAM vast.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) return Response.json({ error: 'Ongeldig match-id' }, { status: 400 })

  const type = req.headers.get('content-type') || ''
  const ext = type.includes('mp4') ? 'mp4' : type.includes('webm') ? 'webm' : null
  if (!ext) return Response.json({ error: 'Enkel mp4 of webm.' }, { status: 415 })
  if (!req.body) return Response.json({ error: 'Lege video.' }, { status: 400 })

  // Uploads zijn duur (schijf + bandbreedte): een paar per minuut per IP volstaat ruimschoots.
  if (!rateLimit(`videoupload:${clientIp(req)}`, 5, 60_000)) {
    return Response.json({ error: 'Te veel uploads na elkaar — probeer zo dadelijk opnieuw.' }, { status: 429 })
  }

  // Vroege weigering wanneer de browser de grootte al meldt (scheelt een nutteloze upload).
  const declared = Number(req.headers.get('content-length') || 0)
  if (declared > MAX_BYTES) {
    return Response.json({ error: `Video te groot (max. ${MAX_MB} MB). Zet ze op YouTube en plak de link.` }, { status: 413 })
  }

  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  if (!match) return Response.json({ error: 'Wedstrijd niet gevonden.' }, { status: 404 })
  if (!mayEditMatchVideo(user, match as { analyseOnly?: boolean | null; analyseOwner?: unknown })) {
    return Response.json({ error: 'Geen rechten voor de video van deze wedstrijd.' }, { status: 403 })
  }

  const file = `${randomBytes(9).toString('hex')}.${ext}`
  const dir = path.join(resolveMediaDir(), 'clips')
  const dst = path.join(dir, file)

  let written = 0
  let tooBig = false
  try {
    await fs.mkdir(dir, { recursive: true })
    // Meetellen tijdens het schrijven: een client kan liegen over content-length, dus we kappen de
    // stroom zelf af zodra de limiet overschreden wordt (en ruimen het halve bestand op).
    const counter = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        written += chunk.byteLength
        if (written > MAX_BYTES) {
          tooBig = true
          controller.error(new Error('te groot'))
          return
        }
        controller.enqueue(chunk)
      },
    })
    await pipeline(
      Readable.fromWeb(req.body.pipeThrough(counter) as never),
      createWriteStream(dst),
    )
    if (written === 0) throw new Error('leeg')

    await payload.update({ collection: 'matches', id: matchId, data: { videoUrl: `/api/clip/${file}` }, overrideAccess: true })
    return Response.json({ ok: true, url: `/api/clip/${file}`, bytes: written })
  } catch (err) {
    await fs.unlink(dst).catch(() => {})
    if (tooBig) {
      return Response.json({ error: `Video te groot (max. ${MAX_MB} MB). Zet ze op YouTube en plak de link.` }, { status: 413 })
    }
    if (written === 0) return Response.json({ error: 'Lege video.' }, { status: 400 })
    console.error('[matchvideo] upload mislukt:', err)
    return Response.json({ error: 'Bewaren op de server mislukt.' }, { status: 500 })
  }
}
