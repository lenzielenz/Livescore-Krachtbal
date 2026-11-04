import { authUser, requireRole } from '@/lib/api-auth'
import { tellingen } from '@/lib/aanvragen-bord'
import { aanvragenLijst } from '@/lib/federatie-aanvragen'
import { federatieTaken } from '@/lib/federatie-dashboard'
import { getPayloadClient } from '@/lib/payload-client'

// Open taken van de federatie, compact: voedt de tellers naast de menu-items in de zijbalk van het
// federatieplatform (components/fed-shell). Enkel federatie/admin; zelfde bron als het dashboard.
//   GET → { taken: [{ sleutel, href, aantal, dringend }], totaal, aanvragen: { nieuw, bezig, wacht, open } }
export async function GET(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  const geweigerd = requireRole(user, 'federatie')
  if (geweigerd) return geweigerd

  const [taken, bord] = await Promise.all([federatieTaken(payload), aanvragenLijst(payload).then(tellingen).catch(() => null)])
  return Response.json({
    taken: taken.map((t) => ({ sleutel: t.sleutel, href: t.href, aantal: t.aantal, dringend: t.dringend })),
    totaal: taken.reduce((n, t) => n + t.aantal, 0),
    aanvragen: bord ? { nieuw: bord.nieuw, bezig: bord.bezig, wacht: bord.wacht, open: bord.open } : null,
  })
}
