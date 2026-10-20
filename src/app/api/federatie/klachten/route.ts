import { isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { klachtBehandelen } from '@/lib/klacht'
import { getPayloadClient } from '@/lib/payload-client'

// De federatie beslist over een klacht: POST { klachtId, actie: 'heropenen' | 'afwijzen', toelichting }.
export async function POST(req: Request) {
  const me = await getAuthUser()
  if (!isFederationLevel(me)) return Response.json({ error: 'Enkel de federatie beslist over een klacht.' }, { status: 403 })
  const body = (await req.json().catch(() => ({}))) as { klachtId?: unknown; actie?: unknown; toelichting?: unknown }
  const klachtId = Number(body.klachtId)
  const actie = body.actie === 'heropenen' || body.actie === 'afwijzen' ? body.actie : null
  if (!Number.isInteger(klachtId) || !actie) return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  try {
    const payload = await getPayloadClient()
    return Response.json({ ok: true, ...(await klachtBehandelen(payload, me, klachtId, actie, String(body.toelichting ?? ''))) })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Mislukt.' }, { status: 400 })
  }
}
