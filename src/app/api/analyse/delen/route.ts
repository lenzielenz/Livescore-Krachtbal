import { canAnalyse } from '@/lib/access'
import { getPayloadClient } from '@/lib/payload-client'

// Analyse delen: beheer met wie je jouw analyse-data deelt — per account in twee gradaties:
// alleen lezen (analyseDeeltMet) of meedoen & aanpassen (analyseDeeltBewerkMet).
// GET → keuzelijst (alle accounts behalve jezelf) + huidige selecties; POST → selecties bewaren.
// De inverses (analyseToegangTot/analyseBewerkTot bij de ontvangers) houdt de Users-hook bij.

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
      lezen: relIds((user as { analyseDeeltMet?: unknown }).analyseDeeltMet),
      bewerken: relIds((user as { analyseDeeltBewerkMet?: unknown }).analyseDeeltBewerkMet),
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}

export async function POST(req: Request) {
  let body: { lezen?: unknown; bewerken?: unknown; userIds?: unknown }
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

    const zonderMij = (ids: number[]) => [...new Set(ids)].filter((id) => String(id) !== String(user.id))
    // Backwards compatible: een oude client die enkel userIds stuurt, deelt alleen-lezen.
    const bewerkenRuw = zonderMij(relIds(body.bewerken))
    const lezenRuw = zonderMij(relIds(body.lezen ?? body.userIds)).filter((id) => !bewerkenRuw.includes(id))

    // Enkel bestaande accounts bewaren.
    const alle = [...lezenRuw, ...bewerkenRuw]
    const found = alle.length
      ? await payload.find({ collection: 'users', where: { id: { in: alle } }, depth: 0, limit: alle.length, overrideAccess: true })
      : { docs: [] as { id: number }[] }
    const bestaat = new Set(found.docs.map((u) => Number(u.id)))
    const lezen = lezenRuw.filter((id) => bestaat.has(id))
    const bewerken = bewerkenRuw.filter((id) => bestaat.has(id))

    await payload.update({
      collection: 'users',
      id: user.id,
      data: { analyseDeeltMet: lezen, analyseDeeltBewerkMet: bewerken },
      user,
      overrideAccess: false,
    })
    return Response.json({ ok: true, lezen, bewerken })
  } catch (err) {
    // Databasefouten niet rauw (met SQL) naar de UI — log de oorzaak en toon een korte uitleg.
    const e = err as Error & { cause?: Error }
    if (/Failed query|timeout|terminat/i.test(e.message)) {
      console.error('analyse-delen databasefout:', e.message, e.cause?.message)
      return Response.json({ error: 'Bewaren mislukt (tijdelijke databasefout) — probeer het meteen opnieuw.' }, { status: 503 })
    }
    return Response.json({ error: e.message }, { status: 400 })
  }
}
