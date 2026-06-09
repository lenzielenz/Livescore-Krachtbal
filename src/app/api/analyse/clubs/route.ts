import { ownsAnalyse, requireAnalyseUser } from '@/lib/analyse-crud'
import { getPayloadClient } from '@/lib/payload-client'
import type { Club } from '@/payload-types'

// CRUD voor analyse-eigen clubs. Elke aangemaakte club krijgt analyseOnly:true + analyseOwner, zodat
// ze nooit in de competitie verschijnt en privé bij de analist blijft. Bewerken/verwijderen kan enkel
// de eigenaar (admin alle). Verwijderen ruimt — via de Clubs-beforeDelete-hook — de ploegen/spelers/
// analysewedstrijden van deze club mee op.
export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }
  try {
    const payload = await getPayloadClient()
    const auth = await requireAnalyseUser(payload, req)
    if ('error' in auth) return auth.error

    const name = String(body.name ?? '').trim()
    if (!name) return Response.json({ error: 'Geef een clubnaam in.' }, { status: 400 })

    const created = await payload.create({
      collection: 'clubs',
      data: {
        name,
        ...(typeof body.logoUrl === 'string' && body.logoUrl.trim() ? { logoUrl: body.logoUrl.trim() } : {}),
        ...(typeof body.colorPrimary === 'string' && body.colorPrimary.trim() ? { colorPrimary: body.colorPrimary.trim() } : {}),
        analyseOnly: true,
        analyseOwner: Number(auth.user.id),
      },
      overrideAccess: true,
    })
    return Response.json({ ok: true, id: (created as { id: number }).id, name })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}

export async function PATCH(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }
  try {
    const payload = await getPayloadClient()
    const auth = await requireAnalyseUser(payload, req)
    if ('error' in auth) return auth.error

    const id = Number(body.id)
    if (!Number.isFinite(id)) return Response.json({ error: 'Ongeldig id.' }, { status: 400 })
    const doc = (await payload.findByID({ collection: 'clubs', id, depth: 0 }).catch(() => null)) as Club | null
    if (!ownsAnalyse(doc, auth.user)) return Response.json({ error: 'Niet gevonden of geen rechten.' }, { status: 404 })

    const data: Record<string, unknown> = {}
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
    if (typeof body.logoUrl === 'string') data.logoUrl = body.logoUrl.trim()
    if (typeof body.colorPrimary === 'string') data.colorPrimary = body.colorPrimary.trim()
    await payload.update({ collection: 'clubs', id, data, overrideAccess: true })
    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}

export async function DELETE(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }
  try {
    const payload = await getPayloadClient()
    const auth = await requireAnalyseUser(payload, req)
    if ('error' in auth) return auth.error

    const id = Number(body.id)
    if (!Number.isFinite(id)) return Response.json({ error: 'Ongeldig id.' }, { status: 400 })
    const doc = (await payload.findByID({ collection: 'clubs', id, depth: 0 }).catch(() => null)) as Club | null
    if (!ownsAnalyse(doc, auth.user)) return Response.json({ error: 'Niet gevonden of geen rechten.' }, { status: 404 })

    await payload.delete({ collection: 'clubs', id, overrideAccess: true })
    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
