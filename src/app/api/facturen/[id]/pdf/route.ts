import { hasRole, isFederationLevel, userClubId } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { factuurPdfGegevens, magFactuurZien } from '@/lib/facturatie-server'
import { getPayloadClient } from '@/lib/payload-client'
import { generateFactuurPdf } from '@/lib/submit/pdf-factuur'

// De factuur als PDF (met betaal-QR). De federatie elke factuur (ook een concept, als voorbeeld); de staf van
// een club enkel haar eigen verstuurde of geannuleerde facturen.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Log in om de factuur te zien.' }, { status: 401 })
  const id = Number((await params).id)
  const f = Number.isSafeInteger(id) ? await payload.findByID({ collection: 'facturen', id, depth: 0, overrideAccess: true }).catch(() => null) : null
  const club = userClubId(user)
  if (!f || !magFactuurZien(user, f as never, isFederationLevel(user), club != null ? Number(club) : null, hasRole(user, 'club-beheerder', 'club-medewerker'))) {
    return Response.json({ error: 'Factuur niet gevonden.' }, { status: 404 })
  }
  const data = await factuurPdfGegevens(payload, id)
  if (!data) return Response.json({ error: 'Factuur niet gevonden.' }, { status: 404 })
  const pdf = await generateFactuurPdf(data)
  return new Response(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="factuur-${data.nummer}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
