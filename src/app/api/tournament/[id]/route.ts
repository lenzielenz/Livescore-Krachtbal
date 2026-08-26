import { isFederationLevel } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'

// Een beker/tornooi verwijderen — enkel de federatie/admin (dezelfde rol die ze aanmaakt).
// De beforeDelete-hook op de Tournaments-collectie ruimt het hele wedstrijdschema mee op.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tournamentId = Number(id)
  if (!Number.isFinite(tournamentId)) return Response.json({ error: 'Ongeldig id' }, { status: 400 })

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, _req)
    if (!isFederationLevel(user)) {
      return Response.json({ error: 'Enkel de federatie kan een beker/tornooi verwijderen.' }, { status: user ? 403 : 401 })
    }
    await payload.delete({ collection: 'tournaments', id: tournamentId, overrideAccess: true })
    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
