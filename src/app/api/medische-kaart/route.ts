import { authUser } from '@/lib/api-auth'
import { kaartAanvragen } from '@/lib/medische-kaart'
import { relId } from '@/lib/meldingen'
import { getPayloadClient } from '@/lib/payload-client'

// Medische kaart aanvragen (zie lib/medische-kaart.ts).
//   POST {} → voor jezelf (je account is gekoppeld aan je spelersdossier)
//   POST { playerId } → als club voor een lid van de eigen club
export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Log in om een medische kaart aan te vragen.' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { playerId?: unknown }
  const playerId = body.playerId != null ? Number(body.playerId) : relId((user as { player?: unknown }).player)
  if (playerId == null || !Number.isFinite(playerId)) {
    return Response.json({ error: 'Je account is niet gekoppeld aan een spelersdossier. Vraag het aan je club.' }, { status: 400 })
  }
  const r = await kaartAanvragen(payload, user, playerId)
  return r.ok ? Response.json({ ok: true, id: r.id }) : Response.json({ error: r.error }, { status: r.status })
}
