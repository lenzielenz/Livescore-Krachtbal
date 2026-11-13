import { authUser } from '@/lib/api-auth'
import { documentenVan, documentOpladen, documentVerwijderen } from '@/lib/lid-documenten'
import { getPayloadClient } from '@/lib/payload-client'
import { clientIp, rateLimit } from '@/lib/sse-hub'

// Documenten per lid (lib/lid-documenten.ts).
//   GET    ?playerId=                       → de documenten die je mag zien
//   POST   multipart: playerId, bestand, titel, soort, opmerking?, zichtbaarVoorLid?
//   DELETE ?id=
export async function GET(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  const docs = await documentenVan(payload, user, Number(new URL(req.url).searchParams.get('playerId')))
  return docs ? Response.json({ ok: true, docs }) : Response.json({ error: 'Niet gevonden.' }, { status: 404 })
}

export async function POST(req: Request) {
  if (!rateLimit(`lid-doc:${clientIp(req)}`, 30, 60_000)) return Response.json({ error: 'Even geduld.' }, { status: 429 })
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  const form = await req.formData().catch(() => null)
  if (!form) return Response.json({ error: 'Ongeldige upload.' }, { status: 400 })
  const r = await documentOpladen(payload, user as never, Number(form.get('playerId')), {
    bestand: form.get('bestand'),
    titel: form.get('titel'),
    soort: form.get('soort'),
    opmerking: form.get('opmerking'),
    zichtbaarVoorLid: form.get('zichtbaarVoorLid'),
  })
  return r.ok ? Response.json(r) : Response.json({ error: r.error }, { status: r.status })
}

export async function DELETE(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  const r = await documentVerwijderen(payload, user, Number(new URL(req.url).searchParams.get('id')))
  return r.ok ? Response.json(r) : Response.json({ error: r.error }, { status: r.status })
}
