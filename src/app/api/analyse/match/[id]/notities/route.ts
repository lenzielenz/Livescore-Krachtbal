import { sorteer, valideerNotitie, voorClient, zichtbaarVoor, type NotitieDoc } from '@/lib/analyse-notities'
import { analyseToegang, weergaveNaam } from '@/lib/app-analyse-toegang'
import { getPayloadClient } from '@/lib/payload-client'
import { rateLimit } from '@/lib/sse-hub'

export const dynamic = 'force-dynamic'

// Notities bij een analyse.
//   GET  → { notities: [...], magSchrijven }   eigen + gedeelde notities (via deellink: enkel gedeelde)
//   POST { tekst, tijdS?, zichtbaarheid? }       nieuwe notitie (wie de analyse mag zien, met account)
// Deellink: ?deel=<token> geeft lezen zonder account.

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const matchId = Number((await params).id)
  if (!Number.isInteger(matchId)) return Response.json({ error: 'Ongeldig match-id.' }, { status: 400 })
  const payload = await getPayloadClient()
  const t = await analyseToegang(payload, req, matchId, new URL(req.url).searchParams.get('deel'))
  if (!t) return Response.json({ error: 'Geen toegang.' }, { status: 403 })

  const res = await payload.find({
    collection: 'analyse-notities',
    where: { match: { equals: matchId } },
    depth: 0,
    limit: 1000,
    overrideAccess: true,
  })
  const lezer = t.viaDeellink ? null : (t.user?.id ?? null)
  const notities = (res.docs as unknown as NotitieDoc[])
    .filter((n) => zichtbaarVoor(n, lezer))
    .map((n) => voorClient(n, lezer, t.beheert))
  return Response.json({ notities: sorteer(notities), magSchrijven: !t.viaDeellink && Boolean(t.user) })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const matchId = Number((await params).id)
  if (!Number.isInteger(matchId)) return Response.json({ error: 'Ongeldig match-id.' }, { status: 400 })
  const payload = await getPayloadClient()
  const t = await analyseToegang(payload, req, matchId)
  if (!t || !t.user) return Response.json({ error: 'Log in om notities toe te voegen.' }, { status: 401 })
  if (!rateLimit(`notitie:${t.user.id}`, 30, 60_000)) {
    return Response.json({ error: 'Even rustig — probeer zo dadelijk opnieuw.' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON.' }, { status: 400 })
  }
  const v = valideerNotitie(body)
  if (!v.ok) return Response.json({ error: v.fout }, { status: 400 })

  const doc = (await payload.create({
    collection: 'analyse-notities',
    data: {
      match: matchId,
      auteur: Number(t.user.id),
      auteurNaam: weergaveNaam(t.user),
      tekst: v.waarde.tekst!,
      tijdS: v.waarde.tijdS ?? null,
      zichtbaarheid: v.waarde.zichtbaarheid ?? 'prive',
    },
    overrideAccess: true,
  })) as unknown as NotitieDoc
  return Response.json({ notitie: voorClient(doc, t.user.id, t.beheert) })
}
