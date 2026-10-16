import { magAanpassen, magVerwijderen, valideerNotitie, voorClient, type NotitieDoc } from '@/lib/analyse-notities'
import { analyseToegang } from '@/lib/app-analyse-toegang'
import { getPayloadClient } from '@/lib/payload-client'

export const dynamic = 'force-dynamic'

// Eén notitie aanpassen (enkel de schrijver) of verwijderen (de schrijver, of de beheerder van de
// analyse voor een gedeelde notitie).

async function laad(req: Request, id: string) {
  const nid = Number(id)
  if (!Number.isInteger(nid)) return { fout: Response.json({ error: 'Ongeldige notitie.' }, { status: 400 }) }
  const payload = await getPayloadClient()
  const n = (await payload
    .findByID({ collection: 'analyse-notities', id: nid, depth: 0, overrideAccess: true })
    .catch(() => null)) as unknown as (NotitieDoc & { match?: unknown }) | null
  if (!n) return { fout: Response.json({ error: 'Notitie niet gevonden.' }, { status: 404 }) }
  const matchId = Number(typeof n.match === 'object' && n.match ? (n.match as { id: number }).id : n.match)
  const t = await analyseToegang(payload, req, matchId)
  if (!t || !t.user) return { fout: Response.json({ error: 'Geen toegang.' }, { status: 403 }) }
  return { payload, n, t, nid }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ nid: string }> }) {
  const l = await laad(req, (await params).nid)
  if ('fout' in l) return l.fout
  if (!magAanpassen(l.n, l.t.user!.id)) return Response.json({ error: 'Enkel de schrijver past een notitie aan.' }, { status: 403 })
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON.' }, { status: 400 })
  }
  const v = valideerNotitie(body, true)
  if (!v.ok) return Response.json({ error: v.fout }, { status: 400 })
  const doc = (await l.payload.update({
    collection: 'analyse-notities',
    id: l.nid,
    data: v.waarde,
    overrideAccess: true,
  })) as unknown as NotitieDoc
  return Response.json({ notitie: voorClient(doc, l.t.user!.id, l.t.beheert) })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ nid: string }> }) {
  const l = await laad(req, (await params).nid)
  if ('fout' in l) return l.fout
  if (!magVerwijderen(l.n, l.t.user!.id, l.t.beheert)) {
    return Response.json({ error: 'Je kan deze notitie niet verwijderen.' }, { status: 403 })
  }
  await l.payload.delete({ collection: 'analyse-notities', id: l.nid, overrideAccess: true })
  return Response.json({ ok: true })
}
