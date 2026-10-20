import { brusselsWallUtc } from '@/lib/datetime'
import { federatieToegang, leesJson } from '@/lib/federatie-api'
import { inschrijvingVerwerken, zaterdagVan } from '@/lib/inschrijving'
import { clubStaf, meld } from '@/lib/meldingen'

// Inschrijvingsrondes en -verwerking (vanuit /beheer/inschrijvingen), enkel de federatie:
//   POST { actie: 'ronde', seizoen, deadline (YYYY-MM-DD), eersteWeekend, laatsteWeekend, vrijeWeekends[], toelichting }
//        → nieuwe ronde; alle clubs krijgen een melding
//   POST { actie: 'sluiten' | 'heropenen', ronde }
//   POST { actie: 'verwerken', id } → ploegen bijgewerkt/aangemaakt, koppels gezet
export async function POST(req: Request) {
  const t = await federatieToegang(req)
  if (t.fout) return t.fout
  const { payload } = t
  const body = (await leesJson(req)) ?? {}
  const datum = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
  try {
    if (body.actie === 'ronde') {
      const seizoen = String(body.seizoen ?? '').trim()
      const deadline = datum(body.deadline)
      const eerste = datum(body.eersteWeekend)
      const laatste = datum(body.laatsteWeekend)
      if (!seizoen || !deadline || !eerste || !laatste) return Response.json({ error: 'Vul seizoen, deadline en eerste/laatste weekend in.' }, { status: 400 })
      if (laatste < eerste) return Response.json({ error: 'Het laatste weekend ligt vóór het eerste.' }, { status: 400 })
      const [y, m, d] = deadline.split('-').map(Number)
      const vrij = (Array.isArray(body.vrijeWeekends) ? body.vrijeWeekends : [])
        .map((v) => ({ weekend: datum((v as { weekend?: unknown }).weekend), reden: String((v as { reden?: unknown }).reden ?? '').trim() || null }))
        .filter((v): v is { weekend: string; reden: string | null } => v.weekend != null)
        .map((v) => ({ ...v, weekend: zaterdagVan(v.weekend) }))
      const r = await payload.create({
        collection: 'inschrijvingsrondes',
        data: {
          seizoen,
          // Tot en met de deadlinedag (23:59 Belgische tijd).
          deadline: brusselsWallUtc(y, m, d, 23, 59).toISOString(),
          status: 'open',
          eersteWeekend: zaterdagVan(eerste),
          laatsteWeekend: zaterdagVan(laatste),
          vrijeWeekends: vrij,
          toelichting: typeof body.toelichting === 'string' ? body.toelichting : null,
        },
        overrideAccess: true,
      })
      const clubs = await payload.find({ collection: 'clubs', where: { analyseOnly: { not_equals: true } }, depth: 0, limit: 500, overrideAccess: true })
      const staf = (await Promise.all(clubs.docs.map((c) => clubStaf(payload, Number(c.id))))).flat()
      await meld(payload, staf, { titel: `📝 Inschrijvingen ${seizoen} zijn open`, tekst: `Schrijf jullie ploegen in vóór ${d}/${m}/${y}, met jullie voorkeuren.`, url: '/club/inschrijving' })
      return Response.json({ ok: true, id: r.id })
    }
    if (body.actie === 'sluiten' || body.actie === 'heropenen') {
      const id = Number(body.ronde)
      await payload.update({ collection: 'inschrijvingsrondes', id, data: { status: body.actie === 'sluiten' ? 'gesloten' : 'open' }, overrideAccess: true })
      return Response.json({ ok: true })
    }
    if (body.actie === 'verwerken') {
      const r = await inschrijvingVerwerken(payload, Number(body.id))
      return r.ok ? Response.json(r) : Response.json({ error: r.error }, { status: r.status })
    }
    return Response.json({ error: 'Onbekende actie.' }, { status: 400 })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
