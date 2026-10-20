import { afgelastingIntrekken, herplannen } from '@/lib/afgelasting'
import { federatieToegang, leesJson } from '@/lib/federatie-api'

// Afgelastingen behandelen (vanuit /beheer/afgelastingen):
//   POST { actie: 'herplannen', id, datum: ISO } → nieuwe datum, clubs en scheidsrechter krijgen een melding
//   POST { actie: 'intrekken', id }              → de wedstrijd gaat door zoals gepland
export async function POST(req: Request) {
  const t = await federatieToegang(req)
  if (t.fout) return t.fout
  const body = await leesJson(req)
  const id = Number(body?.id)
  if (!Number.isFinite(id)) return Response.json({ error: 'Ongeldige afgelasting.' }, { status: 400 })
  try {
    const r =
      body?.actie === 'herplannen'
        ? await herplannen(t.payload, id, String(body.datum ?? ''))
        : body?.actie === 'intrekken'
          ? await afgelastingIntrekken(t.payload, id)
          : ({ ok: false, status: 400, error: 'Onbekende actie.' } as const)
    return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error }, { status: r.status })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
