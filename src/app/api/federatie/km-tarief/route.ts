import { federatieToegang, leesJson } from '@/lib/federatie-api'
import { formatKmTarief } from '@/lib/vergoeding'

// Het km-tarief van de scheidsrechtersvergoeding instellen (Settings.kmTarief). Enkel de federatie.
//   POST { kmTarief: 0.4452 } → { ok, kmTarief, tekst }
export async function POST(req: Request) {
  const t = await federatieToegang(req)
  if (t.fout) return t.fout
  const body = await leesJson(req)
  const waarde = Number(String(body?.kmTarief ?? '').replace(',', '.'))
  if (!Number.isFinite(waarde) || waarde <= 0 || waarde >= 5) {
    return Response.json({ error: 'Geef een tarief tussen € 0,01 en € 4,99 per km.' }, { status: 400 })
  }
  const kmTarief = Math.round(waarde * 10_000) / 10_000
  await t.payload.updateGlobal({ slug: 'settings', data: { kmTarief } as never, overrideAccess: true })
  return Response.json({ ok: true, kmTarief, tekst: formatKmTarief(kmTarief) })
}
