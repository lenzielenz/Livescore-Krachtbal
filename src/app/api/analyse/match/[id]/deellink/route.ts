import { deelToken, maakDeelToken, trekDeelTokenIn } from '@/lib/app-analyse'
import { analyseToegang } from '@/lib/app-analyse-toegang'
import { getPayloadClient } from '@/lib/payload-client'

export const dynamic = 'force-dynamic'

// De deellink van een analyse (zoals bij Veo): wie hem krijgt, bekijkt de analyse en de gedeelde
// notities zonder account. Enkel wie de analyse beheert, maakt hem aan of trekt hem in.
//   GET → { pad | null }   POST → { pad }   DELETE → { ok }

async function beheerder(req: Request, id: string) {
  const matchId = Number(id)
  if (!Number.isInteger(matchId)) return { fout: Response.json({ error: 'Ongeldig match-id.' }, { status: 400 }) }
  const payload = await getPayloadClient()
  const t = await analyseToegang(payload, req, matchId)
  if (!t || !t.beheert) return { fout: Response.json({ error: 'Enkel wie de analyse beheert, kan ze delen.' }, { status: 403 }) }
  return { matchId }
}

const pad = (token: string | null) => (token ? `/analyse/gedeeld/${token}` : null)

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const b = await beheerder(req, (await params).id)
  if ('fout' in b) return b.fout
  return Response.json({ pad: pad(await deelToken(b.matchId)) })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const b = await beheerder(req, (await params).id)
  if ('fout' in b) return b.fout
  return Response.json({ pad: pad(await maakDeelToken(b.matchId)) })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const b = await beheerder(req, (await params).id)
  if ('fout' in b) return b.fout
  await trekDeelTokenIn(b.matchId)
  return Response.json({ ok: true })
}
