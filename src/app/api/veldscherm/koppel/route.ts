import { authUser } from '@/lib/api-auth'
import { isPairingCode } from '@/lib/field-screens'
import { pairMatchToCode } from '@/lib/field-screens-data'
import { getPayloadClient } from '@/lib/payload-client'

// Koppel een gestarte wedstrijd aan een veldscherm via de code die op dat scherm staat. Een
// ingelogde gebruiker volstaat (net als bij /api/veld) — de eigenlijke grendel is de code zelf:
// wie ze op de tv kan lezen, staat fysiek bij dat veld. Zie lib/field-screens-data.ts.
export async function POST(req: Request) {
  let body: { code?: unknown; matchId?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }
  const code = String(body.code ?? '').trim()
  const matchId = Number(body.matchId)
  if (!isPairingCode(code)) return Response.json({ error: 'Voer de 6-cijferige code van het veldscherm in.' }, { status: 400 })
  if (!Number.isFinite(matchId) || matchId <= 0) return Response.json({ error: 'Ongeldige wedstrijd.' }, { status: 400 })

  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })

  try {
    const result = await pairMatchToCode(payload, code, matchId)
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 })
    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
