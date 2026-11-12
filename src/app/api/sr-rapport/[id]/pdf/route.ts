import { authUser, isFederationLevel } from '@/lib/api-auth'
import { formatDateBE, formatDateTimeBE } from '@/lib/datetime'
import { getPayloadClient } from '@/lib/payload-client'
import { AANLEIDING_LABEL, type Aanleiding } from '@/lib/sr-rapport'
import { generateSrRapportPdf } from '@/lib/submit/pdf-documenten'

// Het scheidsrechtersrapport als PDF (RCVK item 27). Lezen: de federatie (het comité) en de
// scheidsrechter die het schreef — niemand anders, ook de clubs niet.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: 'Ongeldig rapport.' }, { status: 400 })
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  const r = await payload.findByID({ collection: 'sr-rapporten', id, depth: 2, overrideAccess: true }).catch(() => null)
  if (!r) return Response.json({ error: 'Rapport niet gevonden.' }, { status: 404 })
  const auteur = r.scheidsrechter && typeof r.scheidsrechter === 'object' ? r.scheidsrechter : null
  const auteurId = auteur ? auteur.id : r.scheidsrechter
  if (!isFederationLevel(user) && String(auteurId) !== String(user.id)) {
    return Response.json({ error: 'Enkel het comité en de scheidsrechter zelf lezen dit rapport.' }, { status: 403 })
  }
  const m = r.match && typeof r.match === 'object' ? r.match : null
  const ploeg = (t: unknown) => (t && typeof t === 'object' ? String((t as { name?: unknown }).name ?? '?') : '?')
  const pdf = await generateSrRapportPdf({
    nummer: id,
    wedstrijd: m ? `${ploeg(m.homeTeam)} - ${ploeg(m.awayTeam)}` : '?',
    datum: m?.date ? formatDateTimeBE(String(m.date)) : '',
    reeks: (m as { reeks?: string | null } | null)?.reeks ?? undefined,
    scheidsrechter: String((auteur as { name?: unknown } | null)?.name ?? r.ondertekendNaam ?? ''),
    aanleidingen: (r.aanleidingen ?? []).map((a) => AANLEIDING_LABEL[a as Aanleiding] ?? String(a)),
    relaas: String(r.relaas ?? ''),
    bijlagen: (r.bijlagen ?? []).map((b) => (b && typeof b === 'object' ? String((b as { filename?: unknown }).filename ?? b.id) : `bijlage ${String(b)}`)),
    ondertekend: { rol: 'Scheidsrechter', naam: String(r.ondertekendNaam ?? ''), op: r.ondertekendOp ? formatDateTimeBE(String(r.ondertekendOp)) : null },
    status: r.status === 'afgehandeld' ? `Afgehandeld${r.behandeldOp ? ` op ${formatDateBE(String(r.behandeldOp))}` : ''}` : 'Bij het comité',
    besluit: (r.besluit as string | null) ?? null,
  })
  return new Response(Buffer.from(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="scheidsrechtersrapport-${id}.pdf"` },
  })
}
