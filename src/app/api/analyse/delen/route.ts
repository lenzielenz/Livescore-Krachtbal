import { canAnalyse } from '@/lib/access'
import { getPayloadClient } from '@/lib/payload-client'

// Analyse delen: beheer met wie je jouw analyse-data deelt (users.analyseDeeltMet).
// GET → keuzelijst (alle accounts behalve jezelf) + huidige selectie; POST → selectie bewaren.
// De inverse (analyseToegangTot bij de ontvangers) wordt door de Users-hook bijgehouden.

const relIds = (v: unknown): number[] =>
  Array.isArray(v)
    ? v
        .map((x) => Number(x && typeof x === 'object' ? (x as { id?: unknown }).id : x))
        .filter((n) => Number.isFinite(n) && n > 0)
    : []

export async function GET(req: Request) {
  try {
    const payload = await getPayloadClient()
    const { user } = await payload.auth({ headers: req.headers })
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!canAnalyse(user)) return Response.json({ error: 'Geen analyse-toegang.' }, { status: 403 })
    // Accountnamen ophalen vergt een override (een gewoon account leest enkel zichzelf) — we
    // geven bewust enkel id + weergavenaam terug, geen e-mailadressen of rollen.
    const res = await payload.find({ collection: 'users', depth: 0, limit: 500, sort: 'name', overrideAccess: true })
    const users = res.docs
      .filter((u) => String(u.id) !== String(user.id))
      .map((u) => ({
        id: u.id,
        name: (u.name as string | undefined)?.trim() || String(u.email ?? '').split('@')[0] || `Account ${u.id}`,
      }))
    return Response.json({
      ok: true,
      users,
      shared: relIds((user as { analyseDeeltMet?: unknown }).analyseDeeltMet),
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}

export async function POST(req: Request) {
  let body: { userIds?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }
  try {
    const payload = await getPayloadClient()
    const { user } = await payload.auth({ headers: req.headers })
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!canAnalyse(user)) return Response.json({ error: 'Geen analyse-toegang.' }, { status: 403 })
    const ids = [...new Set(relIds(body.userIds))].filter((id) => String(id) !== String(user.id))
    // Enkel bestaande accounts bewaren.
    const found = ids.length
      ? await payload.find({ collection: 'users', where: { id: { in: ids } }, depth: 0, limit: ids.length, overrideAccess: true })
      : { docs: [] as { id: number }[] }
    const geldig = found.docs.map((u) => Number(u.id))
    await payload.update({ collection: 'users', id: user.id, data: { analyseDeeltMet: geldig }, user, overrideAccess: false })
    return Response.json({ ok: true, shared: geldig })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
