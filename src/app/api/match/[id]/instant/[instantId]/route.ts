import { isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { removeInstant } from '@/lib/match-channel'
import { getPayloadClient } from '@/lib/payload-client'

export const dynamic = 'force-dynamic'

// Verwijder een foto-instant (moderatie): de eigen poster of federatie/admin. Het bestand wordt
// mee verwijderd en alle kijkers krijgen een 'instant_removed'-event.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; instantId: string }> }) {
  const { id, instantId } = await params
  const matchId = Number(id)
  const iid = Number(instantId)
  if (!Number.isFinite(matchId) || !Number.isFinite(iid)) {
    return Response.json({ error: 'Ongeldig id' }, { status: 400 })
  }

  const user = await getAuthUser()
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const payload = await getPayloadClient()
  const doc = await payload.findByID({ collection: 'match-instants', id: iid, depth: 0 }).catch(() => null)
  if (!doc) return Response.json({ ok: true }) // al weg

  const authorId = typeof doc.author === 'object' && doc.author ? (doc.author as { id?: number }).id : doc.author
  const isOwner = authorId != null && Number(authorId) === Number(user.id)
  if (!isOwner && !isFederationLevel(user)) {
    return Response.json({ error: 'Geen rechten om deze foto te verwijderen.' }, { status: 403 })
  }

  try {
    await payload.delete({ collection: 'match-instants', id: iid, overrideAccess: true })
  } catch {
    return Response.json({ error: 'Verwijderen mislukt.' }, { status: 500 })
  }
  removeInstant(matchId, iid)
  return Response.json({ ok: true })
}
