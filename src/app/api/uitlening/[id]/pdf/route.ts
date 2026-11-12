import { authUser } from '@/lib/api-auth'
import { formatDateBE, formatDateTimeBE } from '@/lib/datetime'
import { getPayloadClient } from '@/lib/payload-client'
import { generateUitleningPdf } from '@/lib/submit/pdf-documenten'
import { UITLEEN_STATUS_LABEL, type UitleenStatus } from '@/lib/uitlening'

// De uitleenovereenkomst als PDF (RCVK item 45). Wie ze mag lezen, bepaalt de read-access van de
// collection (collections/Uitleningen.ts): de federatie, de staf van beide clubs, de speler of zijn
// ouder. Daarom hier zonder overrideAccess, met de ingelogde gebruiker.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: 'Ongeldige overeenkomst.' }, { status: 400 })
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  const u = await payload
    .findByID({ collection: 'uitleningen', id, depth: 1, overrideAccess: false, user: user as never })
    .catch(() => null)
  if (!u) return Response.json({ error: 'Overeenkomst niet gevonden of niet voor u.' }, { status: 404 })

  const naam = (v: unknown) => (v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '') : '')
  const geboren = u.geboortedatum ? new Date(String(u.geboortedatum)) : null
  const op = new Date(String(u.createdAt))
  const leeftijd =
    geboren && Number.isFinite(geboren.getTime())
      ? `${op.getFullYear() - geboren.getFullYear() - (op < new Date(op.getFullYear(), geboren.getMonth(), geboren.getDate()) ? 1 : 0)} jaar`
      : ''
  const teken = (g: { naam?: string | null; op?: string | null } | null | undefined, rol: string) => ({
    rol,
    naam: g?.naam ?? null,
    op: g?.op ? formatDateTimeBE(String(g.op)) : null,
  })
  const pdf = await generateUitleningPdf({
    nummer: id,
    speler: {
      naam: String(u.spelerNaam ?? ''),
      adres: String(u.adres ?? ''),
      geboortedatum: geboren ? formatDateBE(geboren) : '',
      leeftijd,
      categorie: String(u.categorie ?? ''),
    },
    vanClub: naam(u.vanClub),
    naarClub: naam(u.naarClub),
    ploeg: naam(u.naarPloeg),
    competitie: String(u.competitie ?? u.seizoen ?? ''),
    handtekeningen: [
      teken(u.tekenVan, `Namens ${naam(u.vanClub) || 'de uitlenende club'}`),
      teken(u.tekenNaar, `Namens ${naam(u.naarClub) || 'de ontvangende club'}`),
      {
        rol: 'Bevestigd door de federatie',
        naam: u.status === 'bevestigd' ? naam(u.behandeldDoor) || 'KVKBF' : null,
        op: u.status === 'bevestigd' && u.behandeldOp ? formatDateTimeBE(String(u.behandeldOp)) : null,
      },
    ],
    status: UITLEEN_STATUS_LABEL[u.status as UitleenStatus] ?? String(u.status),
    toelichting: (u.toelichting as string | null) ?? null,
  })
  return new Response(Buffer.from(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="uitlening-${id}.pdf"` },
  })
}
