import type { WachtOp } from '@/lib/aanvragen-bord'
import { type DossierActie, dossierBijwerken, taakAanmaken } from '@/lib/dossiers'
import { federatieToegang, leesJson } from '@/lib/federatie-api'

// De dossierlaag van het bord (lib/dossiers.ts), enkel de federatie:
//   POST { actie: 'taak', titel, omschrijving?, behandelaar?, deadline? }                → { ok, sleutel, dossier }
//   POST { sleutel, titel?, actie: 'toewijzen', behandelaar: id | null }                 → { ok, dossier }  (een collega krijgt een melding)
//   POST { sleutel, actie: 'wachten', wachtOp: 'club'|'scheidsrechter'|'speler'|'extern', tekst? }
//   POST { sleutel, actie: 'hervatten' | 'afronden' | 'heropenen' | 'verwijderen' }
//   POST { sleutel, actie: 'notitie', tekst }
//   POST { sleutel, actie: 'deadline', datum: 'YYYY-MM-DD' | null }
export async function POST(req: Request) {
  const t = await federatieToegang(req)
  if (t.fout) return t.fout
  const body = await leesJson(req)
  if (!body) return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  const actie = String(body.actie ?? '')
  const num = (v: unknown) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

  if (actie === 'taak') {
    const r = await taakAanmaken(t.payload, t.user, {
      titel: String(body.titel ?? ''),
      omschrijving: typeof body.omschrijving === 'string' ? body.omschrijving : undefined,
      behandelaar: num(body.behandelaar),
      deadline: typeof body.deadline === 'string' ? body.deadline : null,
    })
    return r.ok ? Response.json(r) : Response.json({ error: r.error }, { status: r.status })
  }

  const sleutel = String(body.sleutel ?? '')
  const titel = typeof body.titel === 'string' ? body.titel : undefined
  let w: DossierActie | null = null
  if (actie === 'toewijzen') w = { actie, behandelaar: num(body.behandelaar) }
  else if (actie === 'wachten') w = { actie, wachtOp: String(body.wachtOp ?? '') as WachtOp, tekst: typeof body.tekst === 'string' ? body.tekst : undefined }
  else if (actie === 'notitie') w = { actie, tekst: String(body.tekst ?? '') }
  else if (actie === 'deadline') w = { actie, datum: typeof body.datum === 'string' ? body.datum : null }
  else if (actie === 'hervatten' || actie === 'afronden' || actie === 'heropenen' || actie === 'verwijderen') w = { actie }
  if (!w) return Response.json({ error: 'Onbekende actie.' }, { status: 400 })

  const r = await dossierBijwerken(t.payload, t.user, sleutel, w, titel)
  return r.ok ? Response.json(r) : Response.json({ error: r.error }, { status: r.status })
}
