import { aftrapVerschuiven } from '@/lib/aftrap'
import { authUser } from '@/lib/api-auth'
import { withLock } from '@/lib/async-mutex'
import { withDbLock } from '@/lib/db-lock'
import { getPayloadClient } from '@/lib/payload-client'

// De aftrap verschuiven op de wedstrijddag (later door file/ziekte/uitloop, of vroeger als een
// wedstrijd ervoor wegvalt), eventueel met de volgende wedstrijden op het terrein. Zie lib/aftrap.ts.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const matchId = Number((await params).id)
  if (!Number.isFinite(matchId)) return Response.json({ error: 'Ongeldige wedstrijd.' }, { status: 400 })
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  try {
    // Zelfde slot als de wedstrijdacties: een verschuiving en een start lopen nooit door elkaar.
    const r = await withLock(`match:${matchId}`, () =>
      withDbLock(payload, 'match', matchId, () =>
        aftrapVerschuiven(payload, user, matchId, {
          nieuw: String(body.nieuw ?? ''),
          reden: String(body.reden ?? ''),
          toelichting: typeof body.toelichting === 'string' ? body.toelichting : null,
          volgendeOok: body.volgendeOok === true,
        }),
      ),
    )
    return r.ok ? Response.json(r) : Response.json({ error: r.error }, { status: r.status })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
