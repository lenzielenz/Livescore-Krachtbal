import { isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'

export const dynamic = 'force-dynamic'

// Verwijder een bezoekersfoto bij een nieuwsbericht: de eigen uploader of federatie/admin (moderatie).
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  const { photoId } = await params
  const pid = Number(photoId)
  if (!Number.isFinite(pid)) return Response.json({ error: 'Ongeldig id' }, { status: 400 })

  const user = await getAuthUser()
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const payload = await getPayloadClient()
  const doc = await payload.findByID({ collection: 'news-photos', id: pid, depth: 0 }).catch(() => null)
  if (!doc) return Response.json({ ok: true }) // al weg

  const uploaderId = typeof doc.uploader === 'object' && doc.uploader ? (doc.uploader as { id?: number }).id : doc.uploader
  const isOwner = uploaderId != null && Number(uploaderId) === Number(user.id)
  if (!isOwner && !isFederationLevel(user)) {
    return Response.json({ error: 'Geen rechten om deze foto te verwijderen.' }, { status: 403 })
  }

  try {
    await payload.delete({ collection: 'news-photos', id: pid, overrideAccess: true })
  } catch {
    return Response.json({ error: 'Verwijderen mislukt.' }, { status: 500 })
  }
  return Response.json({ ok: true })
}
