import { federatieToegang } from '@/lib/federatie-api'
import { lidmaatschappenBijwerken, verzekerden, verzekerdenCsv } from '@/lib/lidmaatschap'

// De verzekerdenlijst voor de verzekeraar (lib/lidmaatschap.ts). Enkel de federatie.
//   GET ?seizoen=2026-2027&club=&sinds=YYYY-MM-DD  → CSV
//   POST                                           → de lidmaatschappen van het lopende seizoen nu bijwerken
export async function GET(req: Request) {
  const t = await federatieToegang(req)
  if (t.fout) return t.fout
  const q = new URL(req.url).searchParams
  const seizoen = q.get('seizoen') ?? ''
  if (!/^\d{4}-\d{4}$/.test(seizoen)) return Response.json({ error: 'Kies een seizoen.' }, { status: 400 })
  const club = q.get('club') ? Number(q.get('club')) : null
  const rijen = await verzekerden(t.payload, seizoen, { club: club && Number.isSafeInteger(club) ? club : null, sinds: q.get('sinds') })
  const naam = `verzekerden-${seizoen}${q.get('sinds') ? `-sinds-${q.get('sinds')}` : ''}.csv`
  return new Response(verzekerdenCsv(rijen), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${naam}"` } })
}

export async function POST(req: Request) {
  const t = await federatieToegang(req)
  if (t.fout) return t.fout
  return Response.json({ ok: true, ...(await lidmaatschappenBijwerken(t.payload)) })
}
