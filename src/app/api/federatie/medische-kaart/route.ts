import { federatieToegang, leesJson } from '@/lib/federatie-api'
import { kaartBehandelen } from '@/lib/medische-kaart'

// De federatie behandelt aanvragen voor een medische kaart.
//   POST { ids: number[], status: 'verstuurd' | 'geweigerd', opmerking? } → { ok, behandeld }
export async function POST(req: Request) {
  const t = await federatieToegang(req)
  if (t.fout) return t.fout
  const body = await leesJson(req)
  const ids = (Array.isArray(body?.ids) ? body!.ids : []).map(Number).filter(Number.isFinite)
  const status = body?.status
  if (!ids.length) return Response.json({ error: 'Kies minstens één aanvraag.' }, { status: 400 })
  if (status !== 'verstuurd' && status !== 'geweigerd') return Response.json({ error: 'Kies verstuurd of geweigerd.' }, { status: 400 })
  if (status === 'geweigerd' && !String(body?.opmerking ?? '').trim()) {
    return Response.json({ error: 'Geef een reden; het lid en de club zien die.' }, { status: 400 })
  }
  const behandeld = await kaartBehandelen(t.payload, ids.slice(0, 300), status, typeof body?.opmerking === 'string' ? body.opmerking : undefined)
  return Response.json({ ok: true, behandeld })
}
