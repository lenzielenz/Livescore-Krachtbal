import type { Where } from 'payload'

import { userClubId } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { rateLimit } from '@/lib/sse-hub'
import { TEMPO, valideerSpoor, vatSporenSamen, type Spoor, type SpoorSoort } from '@/lib/virtueel-sporen'

export const dynamic = 'force-dynamic'

// Sporen in het virtuele stadion (zie lib/virtueel-sporen.ts).
//  GET  ?club=<id>                → de afgeleide toestand van dat stadion (eendjes, verf, popcorn,
//                                   loopband, zetels, highscores, borden, gouden ballen — met die van
//                                   jezelf als je ingelogd bent).
//  POST { soort, waarde }         → iets achterlaten in het stadion van je EIGEN club (bepaald door
//                                   de server). Vereist login; tempo-limiet per soort; elke waarde
//                                   wordt gecontroleerd.

/** Hoeveel sporen we per soort meenemen in de samenvatting (de recentste). */
const PER_SOORT: Record<SpoorSoort, number> = { eend: 120, verf: 6, popcorn: 5000, loopband: 5000, zetel: 2000, doelworp: 2000, bord: 50, vondst: 5000 }

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
  const lijsten = await Promise.all(
    (Object.keys(PER_SOORT) as SpoorSoort[]).map((soort) =>
      payload
        .find({ collection: 'virtuele-sporen', where: { and: [stadionVan(club), { soort: { equals: soort } }] }, sort: '-createdAt', depth: 0, limit: PER_SOORT[soort], overrideAccess: true })
        .then((r) => r.docs as unknown as Record<string, unknown>[])
        .catch(() => [] as Record<string, unknown>[]),
    ),
  )
  const sporen: Spoor[] = lijsten
    .flat()
    .map((d) => ({ id: d.id as number, soort: d.soort as SpoorSoort, waarde: d.waarde as Spoor['waarde'], naam: String(d.authorName ?? 'Supporter'), auteur: relId(d.author), wanneer: String(d.createdAt ?? '') }))
    .sort((a, b) => (a.wanneer < b.wanneer ? -1 : a.wanneer > b.wanneer ? 1 : Number(a.id) - Number(b.id)))
  return Response.json(vatSporenSamen(sporen, ik ? (ik.id as number) : null), { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Log in om iets achter te laten in het stadion.' }, { status: 401 })
  let body: { soort?: unknown; waarde?: unknown }
  try {
    body = (await req.json()) as { soort?: unknown; waarde?: unknown }
  } catch {
    return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  }
  const check = valideerSpoor(body.soort, body.waarde)
  if (!check.ok) return Response.json({ error: check.fout }, { status: 400 })
  if (!rateLimit(`spoor:${check.soort}:${user.id}`, TEMPO[check.soort], 60_000)) {
    return Response.json({ error: 'Even rustig aan — probeer het zo opnieuw.' }, { status: 429 })
  }
  const club = relId(userClubId(user))
  const naam = naamVan(user)
  const doc = await payload.create({
    collection: 'virtuele-sporen',
    data: { club: club ?? undefined, soort: check.soort, author: Number(user.id), authorName: naam, waarde: check.waarde },
    overrideAccess: true,
  })
  return Response.json({ id: doc.id, soort: check.soort, waarde: check.waarde, naam }, { status: 201 })
}
