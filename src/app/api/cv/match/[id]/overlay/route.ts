import { createReadStream } from 'fs'
import fs from 'fs/promises'
import path from 'path'
import { Readable } from 'stream'

import { authUser } from '@/lib/api-auth'
import { werkmap } from '@/lib/cv-analyse'
import { getPayloadClient } from '@/lib/payload-client'
import { mayEditMatchVideo } from '@/lib/video-access'

export const dynamic = 'force-dynamic'

// De controlevideo van de analyse: hetzelfde beeld met het veldmodel, de herkende lijnen, de bal
// en de spelers erover. Dát is wat "zien wat er getrackt wordt" betekent — zonder deze route
// staat het bestand op het volume en kijkt niemand ernaar.
//
// Niet publiek: het is analysemateriaal van een wedstrijd, dus dezelfde kring die de video mag
// beheren. Range-verzoeken worden ondersteund, anders kan je in de speler niet scrubben.

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isInteger(matchId)) return new Response('Ongeldig match-id.', { status: 400 })

  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return new Response('Niet ingelogd.', { status: 401 })
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  if (!match) return new Response('Wedstrijd niet gevonden.', { status: 404 })
  if (!mayEditMatchVideo(user, match as { analyseOnly?: boolean | null; analyseOwner?: unknown })) {
    return new Response('Geen rechten.', { status: 403 })
  }

  const bestand = path.join(werkmap(matchId), 'controle.mp4')
  let totaal: number
  try {
    const st = await fs.stat(bestand)
    if (!st.isFile()) return new Response('Nog geen controlevideo.', { status: 404 })
    totaal = st.size
  } catch {
    return new Response('Nog geen controlevideo.', { status: 404 })
  }

  const bereik = req.headers.get('range')
  const kop = {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=60',
  }

  const m = bereik?.match(/^bytes=(\d*)-(\d*)$/)
  if (m) {
    const van = m[1] ? Number(m[1]) : 0
    const tot = m[2] ? Math.min(Number(m[2]), totaal - 1) : totaal - 1
    if (!(van >= 0 && van <= tot && tot < totaal)) {
      return new Response('Bereik buiten het bestand.', { status: 416, headers: { 'Content-Range': `bytes */${totaal}` } })
    }
    const stroom = Readable.toWeb(createReadStream(bestand, { start: van, end: tot })) as ReadableStream
    return new Response(stroom, {
      status: 206,
      headers: { ...kop, 'Content-Range': `bytes ${van}-${tot}/${totaal}`, 'Content-Length': String(tot - van + 1) },
    })
  }

  const stroom = Readable.toWeb(createReadStream(bestand)) as ReadableStream
  return new Response(stroom, { status: 200, headers: { ...kop, 'Content-Length': String(totaal) } })
}
