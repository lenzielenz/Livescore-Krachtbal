import { getPayloadClient } from '@/lib/payload-client'
import { readVeldMatchId } from '@/lib/screen-selection'

// Centrale veldscherm-selectie. GET levert de gekozen match-id; POST bewaart ze op de
// settings-global. Geen login nodig: de veld-tv wordt ter plaatse bediend en de inzet is
// laag (enkel wélke wedstrijd het veldscherm toont). Zie /cast en /veld/scherm.

export async function GET() {
  try {
    const payload = await getPayloadClient()
    const id = await readVeldMatchId(payload)
    return Response.json({ id })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  let body: { id?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }
  const n = Number(body.id)
  const id = Number.isFinite(n) && n > 0 ? n : null
  try {
    const payload = await getPayloadClient()
    await payload.updateGlobal({ slug: 'settings', data: { veldMatchId: id ? String(id) : '' }, overrideAccess: true })
    return Response.json({ ok: true, id })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
