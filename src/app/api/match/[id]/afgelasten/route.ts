import { authUser } from '@/lib/api-auth'
import { afgelasten } from '@/lib/afgelasting'
import { getPayloadClient } from '@/lib/payload-client'

// De scheidsrechter gelast een wedstrijd af (multipart: reden, toelichting, fotos[]). Zie lib/afgelasting.ts.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const matchId = Number((await params).id)
  if (!Number.isFinite(matchId)) return Response.json({ error: 'Ongeldige wedstrijd.' }, { status: 400 })
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  const form = await req.formData().catch(() => null)
  if (!form) return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  const fotos = form.getAll('fotos').filter((f): f is File => f instanceof File && f.size > 0)
  try {
    const r = await afgelasten(payload, user, matchId, {
      reden: String(form.get('reden') ?? ''),
      toelichting: form.get('toelichting') ? String(form.get('toelichting')) : null,
      fotos,
    })
    return r.ok ? Response.json({ ok: true, id: r.id }) : Response.json({ error: r.error }, { status: r.status })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
