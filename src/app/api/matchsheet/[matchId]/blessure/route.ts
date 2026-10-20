import { authUser } from '@/lib/api-auth'
import { blessureMelden, blessuresVanWedstrijd, magBlessuresZien } from '@/lib/blessure'
import { getPayloadClient } from '@/lib/payload-client'

// Een blessure doorgeven bij een wedstrijd (lib/blessure.ts).
//   GET  → de blessures van deze wedstrijd (enkel voor wie er mag doorgeven)
//   POST { side, playerId?, naam?, omschrijving } → { ok, id }
export async function GET(req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const matchId = Number((await params).matchId)
  if (!Number.isFinite(matchId)) return Response.json({ error: 'Ongeldige wedstrijd.' }, { status: 400 })
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  if (!(await magBlessuresZien(payload, user, matchId))) return Response.json({ error: 'Geen rechten.' }, { status: 403 })
  return Response.json({ blessures: await blessuresVanWedstrijd(payload, matchId) })
}

export async function POST(req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const matchId = Number((await params).matchId)
  if (!Number.isFinite(matchId)) return Response.json({ error: 'Ongeldige wedstrijd.' }, { status: 400 })
  const body = (await req.json().catch(() => null)) as { side?: unknown; playerId?: unknown; naam?: unknown; omschrijving?: unknown } | null
  if (!body) return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  try {
    const r = await blessureMelden(payload, user, matchId, {
      side: body.side === 'away' ? 'away' : 'home',
      playerId: body.playerId != null && body.playerId !== '' ? Number(body.playerId) : null,
      naam: body.naam ? String(body.naam) : null,
      omschrijving: String(body.omschrijving ?? ''),
    })
    return r.ok ? Response.json({ ok: true, id: r.id }) : Response.json({ error: r.error }, { status: r.status })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
