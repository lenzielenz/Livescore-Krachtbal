import { isFederationLevel } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { hasFunctionGrant } from '@/lib/function-grants'
import { getPayloadClient } from '@/lib/payload-client'
import { registratiesBeoordelen } from '@/lib/registratie-server'

// De federatie beslist over ingediende registraties (zie lib/registratie-server.ts):
//   POST { playerIds: number[], besluit: 'goedkeuren' | 'afkeuren', reden?, vergunningsnummers? }
//   → { ok, verwerkt, overgeslagen }
// Federatie/admin, of een toekenning voor 'beheer/leden' (zelfde recht als de ledenkeuring).
export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  if (!isFederationLevel(user) && !(await hasFunctionGrant(payload, user.id, 'beheer/leden'))) {
    return Response.json({ error: 'Enkel de federatie keurt registraties.' }, { status: 403 })
  }

  let body: { playerIds?: unknown; besluit?: unknown; reden?: unknown; vergunningsnummers?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  }
  const ids = (Array.isArray(body.playerIds) ? body.playerIds : []).map(Number).filter(Number.isFinite)
  if (!ids.length) return Response.json({ error: 'Kies minstens één lid.' }, { status: 400 })
  if (body.besluit !== 'goedkeuren' && body.besluit !== 'afkeuren') {
    return Response.json({ error: 'Kies goedkeuren of afkeuren.' }, { status: 400 })
  }
  const nummers =
    body.vergunningsnummers && typeof body.vergunningsnummers === 'object'
      ? Object.fromEntries(Object.entries(body.vergunningsnummers as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')]))
      : undefined

  try {
    const r = await registratiesBeoordelen(payload, user.id, ids.slice(0, 500), {
      besluit: body.besluit,
      reden: typeof body.reden === 'string' ? body.reden : undefined,
      vergunningsnummers: nummers,
    })
    return Response.json({ ok: true, ...r })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
