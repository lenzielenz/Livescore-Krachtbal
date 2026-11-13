import { dateStrBE } from '@/lib/datetime'
import { federatieToegang, leesJson } from '@/lib/federatie-api'
import {
  bankImporteren,
  bankVoorbeeld,
  betalingRegistreren,
  betalingSchrappen,
  conceptBewerken,
  conceptenMaken,
  conceptVerwijderen,
  factuurAnnuleren,
  facturenCsv,
  facturenLijst,
  factuurVersturen,
} from '@/lib/facturatie-server'

// Facturatie door de federatie (/beheer/facturen). Enkel de federatie.
//   GET ?formaat=csv                                     → boekhoudexport (alle verstuurde facturen)
//   POST { actie: 'opmaken', aansluitingen, boetes, scheidsrechters, clubs? }  → concepten per club
//   POST { actie: 'bewerken', id, lijnen?, opmerking? }   → een concept aanpassen
//   POST { actie: 'verwijderen', id }                     → een concept weg
//   POST { actie: 'versturen', id | ids }                 → nummer, mededeling, melding aan de club
//   POST { actie: 'annuleren', id, reden }
//   POST { actie: 'betaling', id, bedrag, datum, opmerking? }
//   POST { actie: 'betaling-schrappen', betalingId }
//   POST { actie: 'bank-voorbeeld', csv }                 → wat bij welke factuur hoort (schrijft niets)
//   POST { actie: 'bank-importeren', csv }                → de gekoppelde betalingen boeken
export async function GET(req: Request) {
  const t = await federatieToegang(req)
  if (t.fout) return t.fout
  const rijen = await facturenLijst(t.payload, { status: { not_equals: 'concept' } }, new Date(), 10_000)
  return new Response(facturenCsv(rijen), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="facturen-${dateStrBE()}.csv"` },
  })
}

export async function POST(req: Request) {
  const t = await federatieToegang(req)
  if (t.fout) return t.fout
  const { payload, user } = t
  const b = (await leesJson(req)) ?? {}
  const id = Number(b.id)
  const antwoord = (r: { ok: true } | { ok: false; status: number; error: string }, extra: Record<string, unknown> = {}) =>
    r.ok ? Response.json({ ...r, ...extra }) : Response.json({ error: r.error }, { status: r.status })

  switch (b.actie) {
    case 'opmaken': {
      const clubs = Array.isArray(b.clubs) ? (b.clubs as unknown[]).map(Number).filter(Number.isSafeInteger) : undefined
      const r = await conceptenMaken(payload, Number(user.id), { aansluitingen: b.aansluitingen === true, boetes: b.boetes === true, scheidsrechters: b.scheidsrechters === true, clubs })
      return Response.json({ ok: true, ...r })
    }
    case 'bewerken':
      return antwoord(await conceptBewerken(payload, id, { lijnen: b.lijnen, opmerking: b.opmerking }))
    case 'verwijderen':
      return antwoord(await conceptVerwijderen(payload, id))
    case 'versturen': {
      const ids = Array.isArray(b.ids) ? (b.ids as unknown[]).map(Number).filter(Number.isSafeInteger) : [id]
      const nummers: string[] = []
      for (const i of ids.slice(0, 500)) {
        const r = await factuurVersturen(payload, i)
        if (!r.ok) return Response.json({ error: r.error, verstuurd: nummers }, { status: r.status })
        nummers.push(r.nummer)
      }
      return Response.json({ ok: true, verstuurd: nummers })
    }
    case 'annuleren':
      return antwoord(await factuurAnnuleren(payload, id, String(b.reden ?? '')))
    case 'betaling':
      return antwoord(
        await betalingRegistreren(payload, {
          factuurId: id,
          bedrag: Number(String(b.bedrag ?? '').replace(',', '.')),
          datum: String(b.datum ?? ''),
          bron: 'manueel',
          opmerking: b.opmerking ? String(b.opmerking) : null,
          userId: Number(user.id),
        }),
      )
    case 'betaling-schrappen':
      return antwoord(await betalingSchrappen(payload, Number(b.betalingId)))
    case 'bank-voorbeeld': {
      const r = await bankVoorbeeld(payload, String(b.csv ?? ''))
      return Array.isArray(r) ? Response.json({ ok: true, regels: r }) : Response.json({ error: r.error }, { status: r.status })
    }
    case 'bank-importeren': {
      const r = await bankImporteren(payload, Number(user.id), String(b.csv ?? ''))
      return r.ok ? Response.json(r) : Response.json({ error: r.error }, { status: r.status })
    }
    default:
      return Response.json({ error: 'Onbekende actie.' }, { status: 400 })
  }
}
