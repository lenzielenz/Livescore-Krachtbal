import { federatieToegang, leesJson } from '@/lib/federatie-api'
import { aanvraagActie, aanvragenLijst } from '@/lib/federatie-aanvragen'
import { behandelaars } from '@/lib/dossiers'

// Het bord met aanvragen en taken (/federatie/aanvragen), enkel de federatie:
//   GET  → { aanvragen: Aanvraag[], behandelaars: [{ id, naam }], ik: { id, naam } }
//   POST { sleutel, actie, toelichting? } → { ok }   — dezelfde afhandeling als het werkscherm van die soort
// De dossierlaag (toewijzen, wachten, notities, taken) zit op /api/federatie/dossiers.
export async function GET(req: Request) {
  const t = await federatieToegang(req)
  if (t.fout) return t.fout
  const [aanvragen, wie] = await Promise.all([aanvragenLijst(t.payload), behandelaars(t.payload)])
  const me = t.user as { id: number | string; name?: unknown; email?: unknown }
  const naam = typeof me.name === 'string' && me.name.trim() ? me.name.trim() : typeof me.email === 'string' ? me.email.split('@')[0]! : 'Ik'
  return Response.json({ aanvragen, behandelaars: wie, ik: { id: Number(me.id), naam } })
}

export async function POST(req: Request) {
  const t = await federatieToegang(req)
  if (t.fout) return t.fout
  const body = await leesJson(req)
  if (!body) return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  const r = await aanvraagActie(t.payload, t.user, String(body.sleutel ?? ''), String(body.actie ?? ''), typeof body.toelichting === 'string' ? body.toelichting : '')
  return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error }, { status: r.status })
}
