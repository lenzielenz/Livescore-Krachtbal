import { authUser, requireRole } from '@/lib/api-auth'
import { federatieTaken } from '@/lib/federatie-dashboard'
import { getPayloadClient } from '@/lib/payload-client'

// Open taken van de federatie, compact: voedt de tellers naast de menu-items in de zijbalk van het
// federatieplatform (components/fed-shell). Enkel federatie/admin; zelfde bron als het dashboard.
//   GET → { taken: [{ sleutel, href, aantal, dringend }], totaal }
export async function GET(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  const geweigerd = requireRole(user, 'federatie')
  if (geweigerd) return geweigerd

  const taken = await federatieTaken(payload)
  return Response.json({
    taken: taken.map((t) => ({ sleutel: t.sleutel, href: t.href, aantal: t.aantal, dringend: t.dringend })),
    totaal: taken.reduce((n, t) => n + t.aantal, 0),
  })
}
