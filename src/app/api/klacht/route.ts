import { getAuthUser } from '@/lib/auth-user'
import { klachtIndienen } from '@/lib/klacht'
import { getPayloadClient } from '@/lib/payload-client'

// Een club dient een klacht in over een ingediend wedstrijdblad: POST { matchId, reden }.
// Wie mag en wanneer: lib/klacht.ts (klachtWeigering).
export async function POST(req: Request) {
  const me = await getAuthUser()
  if (!me) return Response.json({ error: 'Log in om een klacht in te dienen.' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { matchId?: unknown; reden?: unknown }
  const matchId = Number(body.matchId)
  if (!Number.isInteger(matchId) || matchId <= 0) return Response.json({ error: 'Kies een wedstrijd.' }, { status: 400 })
  try {
    const payload = await getPayloadClient()
    const k = await klachtIndienen(payload, me, matchId, String(body.reden ?? ''))
    return Response.json({ ok: true, id: k.id })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Indienen mislukt.' }, { status: 400 })
  }
}
