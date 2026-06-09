import { hasRole, isFederationLevel } from '@/lib/access'
import { competitionWhere } from '@/lib/analyse-access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'

// Bulk-opkuis (federatie/admin): verwijder lege ploegen (geen spelers én geen wedstrijden) en
// lege clubs (geen ploegen, geen account eraan gekoppeld). Standaard PREVIEW; commit=true wist.
const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

export async function POST(req: Request) {
  let commit = false
  try {
    const body = (await req.json()) as { commit?: boolean }
    commit = body.commit === true
  } catch {
    /* preview by default */
  }

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!isFederationLevel(user) && !hasRole(user, 'federatie')) {
      return Response.json({ error: 'Enkel federatie/admin.' }, { status: 403 })
    }

    const [teamsRes, playersRes, matchesRes, clubsRes, usersRes] = await Promise.all([
      payload.find({ collection: 'teams', where: competitionWhere(), depth: 0, limit: 8000 }).catch(() => ({ docs: [] as Record<string, unknown>[] })),
      payload.find({ collection: 'players', where: competitionWhere(), depth: 0, limit: 20000, select: { team: true } }).catch(() => ({ docs: [] as Record<string, unknown>[] })),
      payload.find({ collection: 'matches', where: competitionWhere(), depth: 0, limit: 20000, select: { homeTeam: true, awayTeam: true } }).catch(() => ({ docs: [] as Record<string, unknown>[] })),
      payload.find({ collection: 'clubs', where: competitionWhere(), depth: 0, limit: 8000 }).catch(() => ({ docs: [] as Record<string, unknown>[] })),
      payload.find({ collection: 'users', depth: 0, limit: 8000, select: { club: true } }).catch(() => ({ docs: [] as Record<string, unknown>[] })),
    ])

    const playerCount = new Map<number, number>()
    for (const p of playersRes.docs) {
      const tid = rel((p as { team?: unknown }).team)
      if (tid != null) playerCount.set(tid, (playerCount.get(tid) ?? 0) + 1)
    }
    const matchCount = new Map<number, number>()
    for (const m of matchesRes.docs) {
      for (const tid of [rel((m as { homeTeam?: unknown }).homeTeam), rel((m as { awayTeam?: unknown }).awayTeam)]) {
        if (tid != null) matchCount.set(tid, (matchCount.get(tid) ?? 0) + 1)
      }
    }
    const clubsWithUser = new Set<number>()
    for (const u of usersRes.docs) {
      const cid = rel((u as { club?: unknown }).club)
      if (cid != null) clubsWithUser.add(cid)
    }

    // Lege ploegen: geen spelers én geen wedstrijden.
    const emptyTeams = teamsRes.docs.filter((t) => {
      const id = (t as { id: number }).id
      return (playerCount.get(id) ?? 0) === 0 && (matchCount.get(id) ?? 0) === 0
    })
    const emptyTeamIds = new Set(emptyTeams.map((t) => (t as { id: number }).id))

    // Resterende ploegen per club (na het wissen van de lege).
    const remainingByClub = new Map<number, number>()
    for (const t of teamsRes.docs) {
      const id = (t as { id: number }).id
      if (emptyTeamIds.has(id)) continue
      const cid = rel((t as { club?: unknown }).club)
      if (cid != null) remainingByClub.set(cid, (remainingByClub.get(cid) ?? 0) + 1)
    }
    // Lege clubs: geen resterende ploegen en geen account eraan gekoppeld.
    const emptyClubs = clubsRes.docs.filter((c) => {
      const id = (c as { id: number }).id
      return (remainingByClub.get(id) ?? 0) === 0 && !clubsWithUser.has(id)
    })

    const teamSamples = emptyTeams.slice(0, 12).map((t) => String((t as { name?: unknown }).name ?? '—'))
    const clubSamples = emptyClubs.slice(0, 12).map((c) => String((c as { name?: unknown }).name ?? '—'))

    let deletedTeams = 0
    let deletedClubs = 0
    const errors: string[] = []
    if (commit) {
      for (const t of emptyTeams) {
        try {
          await payload.delete({ collection: 'teams', id: (t as { id: number }).id, overrideAccess: true })
          deletedTeams++
        } catch (e) {
          if (errors.length < 10) errors.push((e as Error).message)
        }
      }
      for (const c of emptyClubs) {
        try {
          await payload.delete({ collection: 'clubs', id: (c as { id: number }).id, overrideAccess: true })
          deletedClubs++
        } catch (e) {
          if (errors.length < 10) errors.push((e as Error).message)
        }
      }
    }

    return Response.json({
      ok: true,
      commit,
      emptyTeams: emptyTeams.length,
      emptyClubs: emptyClubs.length,
      deletedTeams,
      deletedClubs,
      teamSamples,
      clubSamples,
      errors,
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
