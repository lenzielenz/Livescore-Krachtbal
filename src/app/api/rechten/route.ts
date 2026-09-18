import { isFederationLevel } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { functieDef } from '@/lib/function-grants'
import { getPayloadClient } from '@/lib/payload-client'

// Federatie/admin-only: een functie (veldscherm, kantinescherm, ...) toekennen aan of intrekken
// van één gebruiker, los van diens rol. Zie collections/FunctionGrants.ts + lib/function-grants.ts,
// en /beheer/rechten voor het scherm dat dit aanroept.
export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!isFederationLevel(user)) {
    return Response.json({ error: 'Enkel de federatie/admin kan functies toekennen.' }, { status: user ? 403 : 401 })
  }

  let body: { userId?: unknown; functie?: unknown; clubId?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  }

  const userId = Number(body.userId)
  if (!Number.isFinite(userId)) return Response.json({ error: 'Kies een gebruiker.' }, { status: 400 })
  const def = functieDef(String(body.functie ?? ''))
  if (!def) return Response.json({ error: 'Onbekende functie.' }, { status: 400 })
  const clubId = body.clubId != null && Number.isFinite(Number(body.clubId)) ? Number(body.clubId) : null
  if (def.clubGebonden && clubId == null) return Response.json({ error: 'Kies een club voor deze functie.' }, { status: 400 })

  try {
    const doc = await payload.create({
      collection: 'function-grants',
      data: { user: userId, functie: def.value as never, club: def.clubGebonden ? clubId : null },
      overrideAccess: true,
    })
    return Response.json({ ok: true, id: doc.id })
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 })
  }
}

export async function DELETE(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!isFederationLevel(user)) {
    return Response.json({ error: 'Enkel de federatie/admin kan functies intrekken.' }, { status: user ? 403 : 401 })
  }

  const url = new URL(req.url)
  const id = Number(url.searchParams.get('id'))
  if (!Number.isFinite(id)) return Response.json({ error: 'Ongeldige toekenning.' }, { status: 400 })

  try {
    await payload.delete({ collection: 'function-grants', id, overrideAccess: true })
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 })
  }
}
