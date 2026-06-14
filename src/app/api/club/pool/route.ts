import { authUser, userClubId } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { genPoolCode, genPoolId, loadAllPools, readPools, type Pool } from '@/lib/pronostiek-pools'
import { seasonFromDate } from '@/lib/seasons'
import { clientIp, rateLimit } from '@/lib/sse-hub'

export const dynamic = 'force-dynamic'

// Beheer van privé-pronostiekpools binnen een club: aanmaken, joinen (met code), verlaten.
export async function POST(req: Request) {
  const ip = clientIp(req)
  if (!rateLimit(`pool:${ip}`, Number(process.env.POOL_MAX_PER_SEC) || 10, 1000)) {
    return Response.json({ error: 'Te veel verzoeken.' }, { status: 429 })
  }

  let body: { action?: string; name?: string; scope?: string; code?: string; poolId?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    const rawClub = userClubId(user)
    const clubId = rawClub != null && Number.isFinite(Number(rawClub)) ? Number(rawClub) : null
    if (clubId == null) return Response.json({ error: 'Je account is niet aan een club gekoppeld.' }, { status: 403 })
    const userId = Number((user as { id: number }).id)

    const club = await payload.findByID({ collection: 'clubs', id: clubId, depth: 0 }).catch(() => null)
    if (!club) return Response.json({ error: 'Club niet gevonden.' }, { status: 404 })
    const pools = readPools((club as { pronostiekPools?: unknown }).pronostiekPools)
    const seizoen = seasonFromDate(new Date())

    if (body.action === 'create') {
      const name = String(body.name ?? '').trim().slice(0, 60)
      if (!name) return Response.json({ error: 'Geef je pool een naam.' }, { status: 400 })
      // Scope valideren tegen de ploegen/reeksen van de club.
      const scope = String(body.scope ?? 'club')
      const teamsRes = await payload.find({ collection: 'teams', where: { club: { equals: clubId } }, depth: 0, limit: 200 }).catch(() => ({ docs: [] as Record<string, unknown>[] }))
      const teamIds = new Set(teamsRes.docs.map((t) => Number(t.id)))
      const reeksen = new Set(teamsRes.docs.map((t) => String((t as { reeks?: unknown }).reeks ?? '')).filter(Boolean))
      const okScope = scope === 'club' || (scope.startsWith('team:') && teamIds.has(Number(scope.slice(5)))) || (scope.startsWith('reeks:') && reeksen.has(scope.slice(6)))
      if (!okScope) return Response.json({ error: 'Ongeldige scope.' }, { status: 400 })
      if (pools.filter((p) => p.ownerId === userId && p.seizoen === seizoen).length >= 20) {
        return Response.json({ error: 'Je hebt te veel pools aangemaakt.' }, { status: 429 })
      }
      // Unieke code binnen de club.
      let code = genPoolCode()
      const used = new Set(pools.map((p) => p.code))
      while (used.has(code)) code = genPoolCode()
      const pool: Pool = { id: genPoolId(), name, scope, ownerId: userId, members: [userId], code, seizoen, createdAt: Date.now() }
      await payload.update({ collection: 'clubs', id: clubId, data: { pronostiekPools: [...pools, pool] }, overrideAccess: true })
      return Response.json({ ok: true, pool })
    }

    if (body.action === 'join') {
      // Globaal joinen: de pool kan bij een ándere club horen (uitnodiging via deelcode).
      const code = String(body.code ?? '').trim().toUpperCase()
      if (!code) return Response.json({ error: 'Geef een code.' }, { status: 400 })
      const allPools = await loadAllPools(payload)
      const hit = allPools.find((h) => h.pool.code.toUpperCase() === code)
      if (!hit) return Response.json({ error: 'Geen pool met die code.' }, { status: 404 })
      const hostClub = await payload.findByID({ collection: 'clubs', id: hit.hostClubId, depth: 0 }).catch(() => null)
      const hostPools = readPools((hostClub as { pronostiekPools?: unknown } | null)?.pronostiekPools)
      const next = hostPools.map((p) => (p.id === hit.pool.id && !p.members.includes(userId) ? { ...p, members: [...p.members, userId] } : p))
      await payload.update({ collection: 'clubs', id: hit.hostClubId, data: { pronostiekPools: next }, overrideAccess: true })
      return Response.json({ ok: true, pool: { id: hit.pool.id } })
    }

    if (body.action === 'leave') {
      const poolId = String(body.poolId ?? '')
      const allPools = await loadAllPools(payload)
      const hit = allPools.find((h) => h.pool.id === poolId)
      if (!hit) return Response.json({ ok: true }) // al weg
      const hostClub = await payload.findByID({ collection: 'clubs', id: hit.hostClubId, depth: 0 }).catch(() => null)
      const hostPools = readPools((hostClub as { pronostiekPools?: unknown } | null)?.pronostiekPools)
      const next = hostPools
        .map((p) => (p.id === poolId ? { ...p, members: p.members.filter((m) => m !== userId) } : p))
        .filter((p) => p.members.length > 0) // lege pool verdwijnt
      await payload.update({ collection: 'clubs', id: hit.hostClubId, data: { pronostiekPools: next }, overrideAccess: true })
      return Response.json({ ok: true })
    }

    return Response.json({ error: 'Onbekende actie.' }, { status: 400 })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
