import sharp from 'sharp'
import type { Where } from 'payload'

import { isFederationLevel, userClubId } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { rateLimit } from '@/lib/sse-hub'
import { MOZAIEK } from '@/lib/virtueel-mozaiek'

export const dynamic = 'force-dynamic'

// De photobooth in de wandelgang van het virtuele stadion (zie collections/PhotoboothFotos.ts).
//  GET    ?club=<id>  → de foto's van dat stadion (oudste eerst, de recentste MOZAIEK.max), met per
//                       foto een piepkleine tegel voor de mozaïek en of hij van jou is.
//  POST   (form: foto) → je selfie aan de muur van je EIGEN club (bepaald door de server). Vereist
//                       login en heeft een tempo-limiet. De server verkleint de foto en gooit alle
//                       metadata weg.
//  DELETE ?id=<id>    → je eigen foto weer weghalen (of eender welke, voor de federatie).

const MAX_BYTES = 6 * 1024 * 1024

const relId = (v: unknown): number | null => {
  const raw = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}
const stadionVan = (club: number | null): Where => (club ? { club: { equals: club } } : { club: { exists: false } })

function naamVan(user: Record<string, unknown>): string {
  const n = typeof user.name === 'string' ? user.name.trim() : ''
  if (n) return n.split(/\s+/)[0]
  const e = typeof user.email === 'string' ? user.email.split('@')[0] : ''
  return e || 'Supporter'
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const club = relId(url.searchParams.get('club'))
  const payload = await getPayloadClient()
  const ik = await authUser(payload, req).catch(() => null)
  const res = await payload
    .find({ collection: 'photobooth-fotos', where: stadionVan(club), sort: '-createdAt', depth: 0, limit: MOZAIEK.max, overrideAccess: true })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const fotos = (res.docs as unknown as Record<string, unknown>[])
    .map((d) => ({
      id: Number(d.id),
      url: String(d.url ?? ''),
      tegel: String(d.tegel ?? ''),
      naam: String(d.authorName ?? 'Supporter'),
      wanneer: String(d.createdAt ?? ''),
      eigen: ik != null && relId(d.author) === Number(ik.id),
    }))
    .reverse()
  return Response.json({ fotos }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Log in om je foto aan de muur te hangen.' }, { status: 401 })
  if (!rateLimit(`photobooth:${user.id}`, 6, 10 * 60_000)) return Response.json({ error: 'Even rustig aan — probeer het zo opnieuw.' }, { status: 429 })
  const form = await req.formData().catch(() => null)
  const f = form?.get('foto')
  if (!(f instanceof File)) return Response.json({ error: 'Geen foto gevonden.' }, { status: 400 })
  if (!f.type.startsWith('image/')) return Response.json({ error: 'Dat is geen foto.' }, { status: 400 })
  if (f.size > MAX_BYTES) return Response.json({ error: 'De foto is te groot.' }, { status: 400 })
  try {
    const bron = Buffer.from(await f.arrayBuffer())
    // Verkleinen en opnieuw opslaan: dat gooit ook alle metadata (GPS, toestel) weg.
    const foto = await sharp(bron).rotate().resize(480, 600, { fit: 'cover', position: 'attention' }).jpeg({ quality: 82, mozjpeg: true }).toBuffer()
    const tegel = await sharp(foto).resize(MOZAIEK.tegelB, MOZAIEK.tegelH, { fit: 'cover' }).jpeg({ quality: 62 }).toBuffer()
    const naam = naamVan(user)
    const doc = await payload.create({
      collection: 'photobooth-fotos',
      data: { club: relId(userClubId(user)) ?? undefined, author: Number(user.id), authorName: naam, tegel: `data:image/jpeg;base64,${tegel.toString('base64')}` },
      file: { data: foto, mimetype: 'image/jpeg', name: `photobooth-${Date.now()}.jpg`, size: foto.length },
      overrideAccess: true,
    })
    const d = doc as unknown as Record<string, unknown>
    return Response.json({ foto: { id: Number(d.id), url: String(d.url ?? ''), tegel: String(d.tegel ?? ''), naam, wanneer: String(d.createdAt ?? ''), eigen: true } }, { status: 201 })
  } catch {
    return Response.json({ error: 'Die foto kon niet verwerkt worden.' }, { status: 400 })
  }
}

export async function DELETE(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Log in.' }, { status: 401 })
  const id = relId(new URL(req.url).searchParams.get('id'))
  if (!id) return Response.json({ error: 'Welke foto?' }, { status: 400 })
  const doc = await payload.findByID({ collection: 'photobooth-fotos', id, depth: 0, overrideAccess: true }).catch(() => null)
  if (!doc) return Response.json({ error: 'Die foto bestaat niet (meer).' }, { status: 404 })
  if (relId((doc as { author?: unknown }).author) !== Number(user.id) && !isFederationLevel(user)) return Response.json({ error: 'Enkel je eigen foto.' }, { status: 403 })
  await payload.delete({ collection: 'photobooth-fotos', id, overrideAccess: true })
  return Response.json({ ok: true })
}
