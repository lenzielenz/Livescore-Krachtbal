import { authUser } from '@/lib/api-auth'
import { ficheBijwerken, ficheLezen, magFiche } from '@/lib/ledenfiche'
import { relId } from '@/lib/meldingen'
import { getPayloadClient } from '@/lib/payload-client'

// De ledenfiche van een lid (adres, telefoon, noodcontact, toestemmingen): lib/ledenfiche.ts.
//   GET  ?playerId=         → de fiche (leeg = je eigen dossier)
//   POST { playerId?, straat?, postcode?, gemeente?, land?, telefoon?, nationaliteit?, noodcontactNaam?,
//          noodcontactTelefoon?, toestemmingFoto?, toestemmingNieuws? }
// De federatie, de staf van de club van het lid, het lid zelf en elke ouder.
async function wie(req: Request, raw: unknown) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  const playerId = raw != null && raw !== '' ? Number(raw) : relId((user as { player?: unknown } | null)?.player)
  return { payload, user, playerId: playerId != null && Number.isSafeInteger(playerId) ? playerId : null }
}

export async function GET(req: Request) {
  const { payload, user, playerId } = await wie(req, new URL(req.url).searchParams.get('playerId'))
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  if (playerId == null || !(await magFiche(payload, user, playerId))) return Response.json({ error: 'Niet gevonden.' }, { status: 404 })
  return Response.json({ ok: true, fiche: await ficheLezen(payload, playerId) })
}

export async function POST(req: Request) {
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>
  const { payload, user, playerId } = await wie(req, body.playerId)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  if (playerId == null) return Response.json({ error: 'Welk lid?' }, { status: 400 })
  const r = await ficheBijwerken(payload, user, playerId, body)
  return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error }, { status: r.status })
}
