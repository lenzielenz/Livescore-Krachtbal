import { authUser } from '@/lib/api-auth'
import { sanitizeKantineSelectie } from '@/lib/kantine-selectie'
import { getPayloadClient } from '@/lib/payload-client'

export const dynamic = 'force-dynamic'

// Jouw eigen kantinescherm-keuze lezen en bewaren. Login verplicht: dit schrijft op je profiel.
// Het scherm zelf (de tv) leest via /api/kantine/scherm/<id> en heeft géén login nodig.

export async function GET(req: Request) {
  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    return Response.json({
      id: user.id,
      selectie: sanitizeKantineSelectie((user as { kantineScherm?: unknown }).kantineScherm),
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }
  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })

    // Altijd opschonen vóór het opslaan: wat hier binnenkomt komt van een browser, en het scherm
    // dat het straks leest hangt in een kantine waar niemand een foutmelding gaat oplossen.
    const selectie = sanitizeKantineSelectie(body)
    await payload.update({
      collection: 'users',
      id: user.id,
      data: { kantineScherm: selectie },
      overrideAccess: true,
    })
    return Response.json({ ok: true, selectie })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
