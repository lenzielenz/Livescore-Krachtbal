import { isFederationLevel } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'

const VERGUNNING = new Set(['geen', 'aangevraagd', 'geldig'])

// Federatie/admin: zet de vergunning (paspoort), het medisch attest en het doktersverbod van een
// lid. Bepaalt mee of een speler speelgerechtigd is (de opstelling/scheidsrechter zien dat meteen).
export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!isFederationLevel(user)) {
    return Response.json({ error: 'Enkel de federatie/admin kan de keuring beheren.' }, { status: user ? 403 : 401 })
  }

  let body: { playerId?: number; vergunningsstatus?: string; medischAttest?: boolean; hogerSpelenVerbod?: boolean }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  }
  const playerId = Number(body.playerId)
  if (!Number.isFinite(playerId)) return Response.json({ error: 'Ongeldig lid.' }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (body.vergunningsstatus != null) {
    if (!VERGUNNING.has(body.vergunningsstatus)) return Response.json({ error: 'Ongeldige vergunningsstatus.' }, { status: 400 })
    data.vergunningsstatus = body.vergunningsstatus
  }
  if (typeof body.medischAttest === 'boolean') data.medischAttest = body.medischAttest
  if (typeof body.hogerSpelenVerbod === 'boolean') data.hogerSpelenVerbod = body.hogerSpelenVerbod
  if (Object.keys(data).length === 0) return Response.json({ error: 'Niets om te wijzigen.' }, { status: 400 })

  try {
    await payload.update({ collection: 'players', id: playerId, data, overrideAccess: true })
  } catch {
    return Response.json({ error: 'Bijwerken mislukt.' }, { status: 500 })
  }
  return Response.json({ ok: true })
}
