import { authUser } from '@/lib/api-auth'
import { isFederationLevel } from '@/lib/access'
import { ongevalBeoordelen, ongevalIndienen } from '@/lib/ongeval-dossier'
import { getPayloadClient } from '@/lib/payload-client'

// Het ongevalsdossier (lib/ongeval-dossier.ts):
//   POST { actie: 'indienen' }                          → speler/ouder of club dient in bij de federatie
//   POST { actie: 'afhandelen' | 'terugsturen', opmerking? } → enkel de federatie
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id)
  if (!Number.isFinite(id)) return Response.json({ error: 'Ongeldige aangifte.' }, { status: 400 })
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { actie?: string; opmerking?: string }
  let r
  if (body.actie === 'indienen') r = await ongevalIndienen(payload, user, id)
  else if (body.actie === 'afhandelen' || body.actie === 'terugsturen') {
    if (!isFederationLevel(user)) return Response.json({ error: 'Enkel de federatie.' }, { status: 403 })
    r = await ongevalBeoordelen(payload, id, body.actie, body.opmerking)
  } else return Response.json({ error: 'Onbekende actie.' }, { status: 400 })
  return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error }, { status: r.status })
}
