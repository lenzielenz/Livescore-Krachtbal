import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'

// Je eigen meldingen (🔔 in de bovenbalk, /meldingen).
//   GET ?telling=1 → { ongelezen }      GET → { meldingen: [...] } (laatste 50)
//   POST { gelezen: 'alle' | number[] } → { ok }
export async function GET(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ ongelezen: 0, meldingen: [] })
  const eigen = { user: { equals: user.id } }
  if (new URL(req.url).searchParams.get('telling')) {
    const n = await payload.count({ collection: 'meldingen', where: { and: [eigen, { gelezen: { not_equals: true } }] }, overrideAccess: true })
    return Response.json({ ongelezen: n.totalDocs })
  }
  const res = await payload.find({ collection: 'meldingen', where: eigen, sort: '-createdAt', limit: 50, depth: 0, overrideAccess: true })
  return Response.json({
    meldingen: res.docs.map((m) => ({ id: m.id, titel: m.titel, tekst: m.tekst, url: m.url, gelezen: Boolean(m.gelezen), op: m.createdAt })),
  })
}

export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { gelezen?: unknown }
  const eigen = { user: { equals: user.id } }
  const where =
    body.gelezen === 'alle'
      ? eigen
      : { and: [eigen, { id: { in: (Array.isArray(body.gelezen) ? body.gelezen : []).map(Number).filter(Number.isFinite) } }] }
  await payload.update({ collection: 'meldingen', where, data: { gelezen: true }, overrideAccess: true })
  return Response.json({ ok: true })
}
