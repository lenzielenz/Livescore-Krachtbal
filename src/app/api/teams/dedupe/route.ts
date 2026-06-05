import { hasRole, isFederationLevel } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { dedupeKey } from '@/lib/dedupe'
import { getPayloadClient } from '@/lib/payload-client'

// Kuist dubbele ploegen (per reeks) en dubbele clubs op die "dezelfde maar net anders
// geschreven" zijn. De ploeg/club met de meeste wedstrijden/ploegen blijft behouden; de rest
// wordt erin samengevoegd (wedstrijden + spelers verhuizen) en verwijderd. Federatie/admin.
// Standaard PREVIEW; met { commit: true } wordt het uitgevoerd.
const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

export async function POST(req: Request) {
  let commit = false
  try {
    const body = (await req.json()) as { commit?: boolean }
    commit = body.commit === true
  } catch {
    /* lege body = preview */
  }

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!isFederationLevel(user) && !hasRole(user, 'federatie')) {
      return Response.json({ error: 'Enkel federatie/admin.' }, { status: 403 })
    }

    const teamsRes = await payload.find({ collection: 'teams', depth: 0, limit: 8000 }).catch(() => ({ docs: [] as Record<string, unknown>[] }))
    const teams = teamsRes.docs.map((t) => ({ id: (t as { id: number }).id, name: String((t as { name?: unknown }).name ?? ''), reeks: String((t as { reeks?: unknown }).reeks ?? ''), club: rel((t as { club?: unknown }).club) }))

    const matchesRes = await payload.find({ collection: 'matches', depth: 0, limit: 15000 }).catch(() => ({ docs: [] as Record<string, unknown>[] }))
    const playersRes = await payload.find({ collection: 'players', depth: 0, limit: 15000 }).catch(() => ({ docs: [] as Record<string, unknown>[] }))

    const matchCount = new Map<number, number>()
    for (const m of matchesRes.docs) {
      for (const tid of [rel((m as { homeTeam?: unknown }).homeTeam), rel((m as { awayTeam?: unknown }).awayTeam)]) {
        if (tid != null) matchCount.set(tid, (matchCount.get(tid) ?? 0) + 1)
      }
    }
    const playerCount = new Map<number, number>()
    for (const p of playersRes.docs) {
      const tid = rel((p as { team?: unknown }).team)
      if (tid != null) playerCount.set(tid, (playerCount.get(tid) ?? 0) + 1)
    }
    const weight = (id: number) => (matchCount.get(id) ?? 0) * 1000 + (playerCount.get(id) ?? 0)

    // Ploegen groeperen op (reeks, sleutel).
    const tGroups = new Map<string, typeof teams>()
    for (const t of teams) {
      if (!t.name) continue
      const k = `${t.reeks}|${dedupeKey(t.name)}`
      const arr = tGroups.get(k) ?? []
      arr.push(t)
      tGroups.set(k, arr)
    }
    const teamMerges: { keep: string; reeks: string; merge: string[] }[] = []
    const dupMap = new Map<number, number>() // dup teamId → keep teamId
    for (const list of tGroups.values()) {
      if (list.length < 2) continue
      list.sort((a, b) => weight(b.id) - weight(a.id) || b.name.length - a.name.length)
      const keep = list[0]
      const dups = list.slice(1)
      teamMerges.push({ keep: keep.name, reeks: keep.reeks, merge: dups.map((d) => d.name) })
      for (const d of dups) dupMap.set(d.id, keep.id)
    }

    // Clubs groeperen op sleutel; behoud de club met de meeste ploegen.
    const clubsRes = await payload.find({ collection: 'clubs', depth: 0, limit: 8000 }).catch(() => ({ docs: [] as Record<string, unknown>[] }))
    const clubs = clubsRes.docs.map((c) => ({ id: (c as { id: number }).id, name: String((c as { name?: unknown }).name ?? '') }))
    const clubTeamCount = new Map<number, number>()
    for (const t of teams) if (t.club != null) clubTeamCount.set(t.club, (clubTeamCount.get(t.club) ?? 0) + 1)
    const cGroups = new Map<string, typeof clubs>()
    for (const c of clubs) {
      if (!c.name) continue
      const arr = cGroups.get(dedupeKey(c.name)) ?? []
      arr.push(c)
      cGroups.set(dedupeKey(c.name), arr)
    }
    const clubMerges: { keep: string; merge: string[] }[] = []
    const clubDupMap = new Map<number, number>()
    for (const list of cGroups.values()) {
      if (list.length < 2) continue
      list.sort((a, b) => (clubTeamCount.get(b.id) ?? 0) - (clubTeamCount.get(a.id) ?? 0) || b.name.length - a.name.length)
      const keep = list[0]
      const dups = list.slice(1)
      clubMerges.push({ keep: keep.name, merge: dups.map((d) => d.name) })
      for (const d of dups) clubDupMap.set(d.id, keep.id)
    }

    const committed = { teamsMerged: 0, clubsMerged: 0, matchesMoved: 0, playersMoved: 0 }
    if (commit) {
      // Wedstrijden verhuizen naar de behouden ploeg.
      for (const m of matchesRes.docs) {
        const home = rel((m as { homeTeam?: unknown }).homeTeam)
        const away = rel((m as { awayTeam?: unknown }).awayTeam)
        const nh = home != null ? dupMap.get(home) : undefined
        const na = away != null ? dupMap.get(away) : undefined
        if (nh == null && na == null) continue
        const data: { homeTeam?: number; awayTeam?: number } = {}
        if (nh != null) data.homeTeam = nh
        if (na != null) data.awayTeam = na
        await payload.update({ collection: 'matches', id: (m as { id: number }).id, data, overrideAccess: true }).catch(() => {})
        committed.matchesMoved++
      }
      // Spelers verhuizen.
      for (const p of playersRes.docs) {
        const tid = rel((p as { team?: unknown }).team)
        const nt = tid != null ? dupMap.get(tid) : undefined
        if (nt == null) continue
        await payload.update({ collection: 'players', id: (p as { id: number }).id, data: { team: nt }, overrideAccess: true }).catch(() => {})
        committed.playersMoved++
      }
      // Dubbele ploegen verwijderen.
      for (const dupId of dupMap.keys()) {
        await payload.delete({ collection: 'teams', id: dupId, overrideAccess: true }).catch(() => {})
        committed.teamsMerged++
      }
      // Behouden ploegen naar de behouden club herkoppelen, dan dubbele clubs verwijderen.
      for (const t of teams) {
        if (dupMap.has(t.id) || t.club == null) continue
        const nc = clubDupMap.get(t.club)
        if (nc != null) await payload.update({ collection: 'teams', id: t.id, data: { club: nc }, overrideAccess: true }).catch(() => {})
      }
      for (const dupClubId of clubDupMap.keys()) {
        await payload.delete({ collection: 'clubs', id: dupClubId, overrideAccess: true }).catch(() => {})
        committed.clubsMerged++
      }
    }

    return Response.json({
      ok: true,
      commit,
      teamGroups: teamMerges.length,
      teamsToMerge: dupMap.size,
      clubGroups: clubMerges.length,
      clubsToMerge: clubDupMap.size,
      teamMerges: teamMerges.slice(0, 60),
      clubMerges: clubMerges.slice(0, 60),
      committed,
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
