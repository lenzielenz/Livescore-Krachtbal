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
import { geldigUploadId, hervatBytes } from '@/lib/video-upload'
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
/** Waar de stukken van een lopende upload verzameld worden, tot ze compleet zijn. */
function deelPad(uploadId: string, ext: string): string {
  return path.join(resolveMediaDir(), 'clips', `.deel-${uploadId}.${ext}`)
}

/** Toegang tot de video van deze wedstrijd, of een antwoord dat zegt waarom niet. */
async function toegang(req: Request, matchId: number) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return { fout: Response.json({ error: 'Niet ingelogd.' }, { status: 401 }) }
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  if (!match) return { fout: Response.json({ error: 'Wedstrijd niet gevonden.' }, { status: 404 }) }
  if (!mayEditMatchVideo(user, match as { analyseOnly?: boolean | null; analyseOwner?: unknown })) {
    return { fout: Response.json({ error: 'Geen rechten voor de video van deze wedstrijd.' }, { status: 403 }) }
  }
  return { payload }
}

/**
 * Hoever staat een onderbroken upload al?
 *
 * De client vraagt dit vóór hij begint: staat er al iets van een vorige poging, dan slaat hij de
 * stukken over die er al zijn. Enkel hele stukken tellen — de server plakt stukken aan elkaar en
 * kan niet halverwege beginnen — dus een half aangekomen stuk wordt afgekapt.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) return Response.json({ error: 'Ongeldig match-id' }, { status: 400 })

  const uploadId = new URL(req.url).searchParams.get('uploadId') ?? ''
  if (!geldigUploadId(uploadId)) return Response.json({ error: 'Ongeldig upload-id.' }, { status: 400 })

  const t = await toegang(req, matchId)
  if ('fout' in t) return t.fout

  for (const ext of ['mp4', 'webm']) {
    const pad = deelPad(uploadId, ext)
    const st = await fs.stat(pad).catch(() => null)
    if (st) {
      // Afkappen op een heel stuk: de rest zou een halve videoblok zijn.
      const bruikbaar = hervatBytes(st.size)
      if (bruikbaar !== st.size) await fs.truncate(pad, bruikbaar).catch(() => undefined)
      return Response.json({ bytes: bruikbaar })
    }
  }
  return Response.json({ bytes: 0 })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) return Response.json({ error: 'Ongeldig match-id' }, { status: 400 })

  const type = req.headers.get('content-type') || ''
  const ext = type.includes('mp4') ? 'mp4' : type.includes('webm') ? 'webm' : null
  if (!ext) return Response.json({ error: 'Enkel mp4 of webm.' }, { status: 415 })
  if (!req.body) return Response.json({ error: 'Lege video.' }, { status: 400 })

  // Eén stuk van een grotere upload, of het hele bestand ineens? Een wedstrijdvideo van honderden
  // megabytes in één verzoek betekent één verbinding die minutenlang moet houden; valt die weg,
  // dan is alles weg. In stukken kost een hapering hoogstens dat ene stuk.
  const uploadId = req.headers.get('x-upload-id') ?? ''
  const inStukken = geldigUploadId(uploadId)
  const laatste = req.headers.get('x-laatste-stuk') === '1'
  const vanaf = Number(req.headers.get('x-offset') || 0)

  // Uploads zijn duur (schijf + bandbreedte). Per stuk tellen zou een upload van tweehonderd
  // stukken meteen blokkeren, dus tellen we per upload-sessie — en die zijn er nog altijd maar
  // een paar per minuut.
  const sleutel = inStukken ? `videoupload:stuk:${uploadId}` : `videoupload:${clientIp(req)}`
  const perMinuut = inStukken ? 400 : 5
  if (!rateLimit(sleutel, perMinuut, 60_000)) {
    return Response.json({ error: 'Te veel uploads na elkaar — probeer zo dadelijk opnieuw.' }, { status: 429 })
  }

  // Vroege weigering wanneer de browser de grootte al meldt (scheelt een nutteloze upload).
  const declared = Number(req.headers.get('content-length') || 0)
  if (declared + (inStukken ? Math.max(0, vanaf) : 0) > MAX_BYTES) {
    return Response.json({ error: `Video te groot (max. ${MAX_MB} MB). Zet ze op YouTube en plak de link.` }, { status: 413 })
  }

  const t = await toegang(req, matchId)
  if ('fout' in t) return t.fout
  const { payload } = t

  const dir = path.join(resolveMediaDir(), 'clips')
  // In stukken groeit één verzamelbestand; ineens gaat het rechtstreeks naar zijn eindnaam.
  const file = `${randomBytes(9).toString('hex')}.${ext}`
  const dst = inStukken ? deelPad(uploadId, ext) : path.join(dir, file)

  let written = 0
  let tooBig = false
  try {
    await fs.mkdir(dir, { recursive: true })
    // Bij het hervatten telt wat er al staat mee voor de limiet, en moet er achteraan geplakt
    // worden op precies de plek die de client verwacht — niet zomaar aan het einde van wat er
    // toevallig ligt, want dan zou een dubbel verstuurd stuk er twee keer in belanden.
    let alStaat = 0
    if (inStukken) {
      const st = await fs.stat(dst).catch(() => null)
      alStaat = st?.size ?? 0
      if (vanaf !== alStaat) {
        return Response.json(
          { error: 'De upload liep uit de pas.', bytes: alStaat },
          { status: 409 },
        )
      }
    }

    // Meetellen tijdens het schrijven: een client kan liegen over content-length, dus we kappen de
    // stroom zelf af zodra de limiet overschreden wordt (en ruimen het halve bestand op).
    const counter = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        written += chunk.byteLength
        if (alStaat + written > MAX_BYTES) {
          tooBig = true
          controller.error(new Error('te groot'))
          return
        }
        controller.enqueue(chunk)
      },
    })
    await pipeline(
      Readable.fromWeb(req.body.pipeThrough(counter) as never),
      createWriteStream(dst, inStukken ? { flags: 'a' } : {}),
    )
    if (written === 0 && !inStukken) throw new Error('leeg')

    if (inStukken && !laatste) {
      // Nog niet klaar: enkel melden hoever we staan, zodat de client verder kan.
      return Response.json({ ok: true, bytes: alStaat + written })
    }

    if (inStukken) {
      // Compleet: het verzamelbestand krijgt zijn echte naam. Pas nu is er een speelbare video.
      const totaal = alStaat + written
      if (totaal === 0) {
        await fs.unlink(dst).catch(() => {})
        return Response.json({ error: 'Lege video.' }, { status: 400 })
      }
      await fs.rename(dst, path.join(dir, file))
      await payload.update({ collection: 'matches', id: matchId, data: { videoUrl: `/api/clip/${file}` }, overrideAccess: true })
      return Response.json({ ok: true, url: `/api/clip/${file}`, bytes: totaal })
    }

    await payload.update({ collection: 'matches', id: matchId, data: { videoUrl: `/api/clip/${file}` }, overrideAccess: true })
    return Response.json({ ok: true, url: `/api/clip/${file}`, bytes: written })
  } catch (err) {
    // Een half aangekomen stuk mag blijven staan: de GET hierboven kapt het straks af op een heel
    // stuk en de client hervat daar. Enkel een upload-in-één-keer heeft er niets aan.
    if (!inStukken) await fs.unlink(dst).catch(() => {})
    if (tooBig) {
      if (inStukken) await fs.unlink(dst).catch(() => {})
      return Response.json({ error: `Video te groot (max. ${MAX_MB} MB). Zet ze op YouTube en plak de link.` }, { status: 413 })
    }
    if (written === 0 && !inStukken) return Response.json({ error: 'Lege video.' }, { status: 400 })
    console.error('[matchvideo] upload mislukt:', err)
    return Response.json({ error: 'Bewaren op de server mislukt.' }, { status: 500 })
  }
}
