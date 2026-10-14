import type { Where } from 'payload'

import { userClubId } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { rateLimit } from '@/lib/sse-hub'
import { muurLengte, valideerStreken, type Streek, type Tag } from '@/lib/virtueel-graffiti'

export const dynamic = 'force-dynamic'

// De graffitimuur van het virtuele stadion (zie lib/virtueel-graffiti.ts).
//  GET  ?club=<id>   → alle tags van die muur (oudste eerst), en hoe lang de muur nu is.
//  POST { streken }  → een nieuwe tag op de muur van je EIGEN club (bepaald door de server, niet
//                      door de bezoeker). Vereist login; een tempo-limiet tegen spam; elke streek
//                      wordt gecontroleerd. Een tag blijft staan (moderatie via de admin).

const MAX_TAGS = 1500

const relId = (v: unknown): number | null => {
  const raw = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

const muurVan = (club: number | null): Where => (club ? { club: { equals: club } } : { club: { exists: false } })

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
  const res = await payload
    .find({ collection: 'graffiti-tags', where: muurVan(club), sort: '-createdAt', depth: 0, limit: MAX_TAGS, overrideAccess: true })
    .catch(() => ({ docs: [] as Record<string, unknown>[], totalDocs: 0 }))
  const tags: Tag[] = (res.docs as Record<string, unknown>[])
    .map((d) => ({ id: d.id as number, auteur: String(d.authorName ?? 'Supporter'), streken: (Array.isArray(d.strokes) ? d.strokes : []) as Streek[] }))
    .reverse()
  return Response.json({ tags, lengte: muurLengte(res.totalDocs ?? tags.length) }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Log in om op de muur te spuiten.' }, { status: 401 })
  if (!rateLimit(`graffiti:${user.id}`, 6, 60_000)) {
    return Response.json({ error: 'Even laten drogen — je spoot net nog iets.' }, { status: 429 })
  }
  let body: { streken?: unknown }
  try {
    body = (await req.json()) as { streken?: unknown }
  } catch {
    return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  }
  const club = relId(userClubId(user))
  const aantal = await payload.count({ collection: 'graffiti-tags', where: muurVan(club), overrideAccess: true }).catch(() => ({ totalDocs: 0 }))
  const lengte = muurLengte(aantal.totalDocs)
  const check = valideerStreken(body.streken, lengte)
  if (!check.ok) return Response.json({ error: check.fout }, { status: 400 })
  const auteur = naamVan(user)
  const doc = await payload.create({
    collection: 'graffiti-tags',
    data: { club: club ?? undefined, author: Number(user.id), authorName: auteur, strokes: check.streken },
    overrideAccess: true,
  })
  const tag: Tag = { id: doc.id, auteur, streken: check.streken }
  return Response.json({ tag, lengte: muurLengte(aantal.totalDocs + 1) }, { status: 201 })
}
