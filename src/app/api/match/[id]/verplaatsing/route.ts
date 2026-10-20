import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { verplaatsingAanvragen, verplaatsingBeantwoorden } from '@/lib/verplaatsing'

// Verplaatsingsaanvraag (lib/verplaatsing.ts):
//   POST { actie: 'aanvragen', voorgesteld: ISO, reden }                         → club van een van beide ploegen
//   POST { actie: 'akkoord' | 'weigeren', id, opmerking? }                        → de tegenpartij
//   POST { actie: 'intrekken', id }                                               → de aanvrager
//   POST { actie: 'goedkeuren' | 'afwijzen', id, opmerking? }                     → de federatie
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const matchId = Number((await params).id)
  if (!Number.isFinite(matchId)) return Response.json({ error: 'Ongeldige wedstrijd.' }, { status: 400 })
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  try {
    const actie = String(body.actie ?? '')
    const r =
      actie === 'aanvragen'
        ? await verplaatsingAanvragen(payload, user, matchId, String(body.voorgesteld ?? ''), String(body.reden ?? ''))
        : ['akkoord', 'weigeren', 'intrekken', 'goedkeuren', 'afwijzen'].includes(actie)
          ? await verplaatsingBeantwoorden(payload, user, Number(body.id), actie as never, typeof body.opmerking === 'string' ? body.opmerking : null)
          : ({ ok: false, status: 400, error: 'Onbekende actie.' } as const)
    return r.ok ? Response.json(r) : Response.json({ error: r.error }, { status: r.status })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
