import { hasRole, isFederationLevel, userClubId } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { factuurUbl, magFactuurZien } from '@/lib/facturatie-server'
import { getPayloadClient } from '@/lib/payload-client'

// De e-factuur (UBL 2.1, Peppol BIS Billing 3.0) van een verstuurde factuur — voor het boekhoudpakket of een
// Peppol-toegangspunt. De federatie elke factuur; de staf van een club enkel de eigen.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  const id = Number((await params).id)
  const f = Number.isSafeInteger(id) ? await payload.findByID({ collection: 'facturen', id, depth: 0, overrideAccess: true }).catch(() => null) : null
  const club = userClubId(user)
  if (!f || !magFactuurZien(user, f as never, isFederationLevel(user), club != null ? Number(club) : null, hasRole(user, 'club-beheerder', 'club-medewerker'))) {
    return Response.json({ error: 'Factuur niet gevonden.' }, { status: 404 })
  }
  const r = await factuurUbl(payload, id)
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status })
  return new Response(r.xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': `attachment; filename="factuur-${r.nummer}.xml"`, 'Cache-Control': 'private, no-store' },
  })
}
