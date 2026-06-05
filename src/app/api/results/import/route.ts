import { hasRole, isFederationLevel } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksCategorie, type Reeks } from '@/lib/reeksen'
import { isPlayed, norm, parseResultsHtml } from '@/lib/results-import'

// Importeer officiële uitslagen (HTML-tabel-export). Maakt/voltooit wedstrijden met eindstand.
// Standaard PREVIEW (niets wegschrijven); met { commit: true } worden de wijzigingen toegepast.
// Enkel federatie/admin.

// Eindstand → simpleScore (de app bewaart geen vast scoreveld; de stand wordt uit simpleScore
// + worpen afgeleid). We zetten X+Y losse doelpunten van 1 punt zodat de totaalstand klopt.
function buildSimpleScore(home: number, away: number) {
  const goals: { side: 'home' | 'away'; points: number; half: number; clock: number; ts: number }[] = []
  let ts = 0
  for (let k = 0; k < home; k++) goals.push({ side: 'home', points: 1, half: 1, clock: 0, ts: ts++ })
  for (let k = 0; k < away; k++) goals.push({ side: 'away', points: 1, half: 1, clock: 0, ts: ts++ })
  return { goals, crosses: { home: 0, away: 0 } }
}

const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

export async function POST(req: Request) {
  let body: { text?: string; commit?: boolean }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }
  const text = String(body.text ?? '')
  const commit = body.commit === true
  if (!text.trim()) return Response.json({ error: 'Geen bestandsinhoud.' }, { status: 400 })

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!isFederationLevel(user) && !hasRole(user, 'federatie')) {
      return Response.json({ error: 'Enkel federatie/admin mag importeren.' }, { status: 403 })
    }

    const all = parseResultsHtml(text)
    const played = all.filter(isPlayed)

    // Ploegen → opzoeken op (reeks, naam), met val-terug op een unieke naam over alle reeksen.
    const teamsRes = await payload.find({ collection: 'teams', depth: 0, limit: 5000 }).catch(() => ({ docs: [] as Record<string, unknown>[] }))
    const byName = new Map<string, { id: number; reeks: string }[]>()
    for (const t of teamsRes.docs) {
      const key = norm(String((t as { name?: unknown }).name ?? ''))
      if (!key) continue
      const arr = byName.get(key) ?? []
      arr.push({ id: (t as { id: number }).id, reeks: String((t as { reeks?: unknown }).reeks ?? '') })
      byName.set(key, arr)
    }
    const resolveTeam = (name: string, reeks: string): number | null => {
      const list = byName.get(norm(name)) ?? []
      if (list.length === 0) return null
      const exact = list.find((x) => x.reeks === reeks)
      if (exact) return exact.id
      return list.length === 1 ? list[0].id : null
    }

    // Bestaande wedstrijden voor dedup (per reeks).
    const reeksSet = [...new Set(played.map((r) => r.reeks).filter((x): x is string => !!x))]
    const existingRes = reeksSet.length
      ? await payload.find({ collection: 'matches', where: { reeks: { in: reeksSet } }, depth: 0, limit: 8000 }).catch(() => ({ docs: [] as Record<string, unknown>[] }))
      : { docs: [] as Record<string, unknown>[] }
    const existKey = new Map<string, number>()
    for (const m of existingRes.docs) {
      const hid = rel((m as { homeTeam?: unknown }).homeTeam)
      const aid = rel((m as { awayTeam?: unknown }).awayTeam)
      const d = String((m as { date?: unknown }).date ?? '').slice(0, 10)
      const rk = String((m as { reeks?: unknown }).reeks ?? '')
      if (hid != null && aid != null) existKey.set(`${rk}|${hid}|${aid}|${d}`, (m as { id: number }).id)
    }

    let toCreate = 0
    let toUpdate = 0
    const skippedReeks = new Set<string>()
    const unmatched = new Set<string>()
    const samples: string[] = []
    type Op = { kind: 'create' | 'update'; id?: number; reeks: Reeks; hid: number; aid: number; dateISO: string; home: number; away: number }
    const ops: Op[] = []

    for (const r of played) {
      if (!r.reeks) { skippedReeks.add(r.reeksCode); continue }
      const hid = resolveTeam(r.home, r.reeks)
      const aid = resolveTeam(r.away, r.reeks)
      if (hid == null) unmatched.add(r.home)
      if (aid == null) unmatched.add(r.away)
      if (hid == null || aid == null) continue

      const dateISO = r.date ? `${r.date}T${r.time && /^\d{1,2}:\d{2}/.test(r.time) ? (r.time.length === 5 ? `${r.time}:00` : r.time) : '00:00:00'}` : ''
      if (!dateISO) continue
      const key = `${r.reeks}|${hid}|${aid}|${r.date}`
      const existingId = existKey.get(key)
      const op: Op = { kind: existingId ? 'update' : 'create', id: existingId, reeks: r.reeks as Reeks, hid, aid, dateISO, home: r.homeScore, away: r.awayScore }
      if (existingId) toUpdate++
      else toCreate++
      ops.push(op)
      if (samples.length < 10) samples.push(`${r.home} ${r.homeScore}–${r.awayScore} ${r.away} · ${r.reeks} · ${r.date}`)
    }

    let committed = 0
    const errors: string[] = []
    if (commit) {
      for (const op of ops) {
        try {
          if (op.kind === 'update' && op.id != null) {
            await payload.update({
              collection: 'matches',
              id: op.id,
              data: { status: 'finished', simpleScore: buildSimpleScore(op.home, op.away) },
              overrideAccess: true,
            })
          } else {
            await payload.create({
              collection: 'matches',
              data: {
                reeks: op.reeks,
                category: reeksCategorie(op.reeks),
                homeTeam: op.hid,
                awayTeam: op.aid,
                date: op.dateISO,
                status: 'finished',
                goalAreaDepth: 10,
                analyseOnly: false,
                simpleScore: buildSimpleScore(op.home, op.away),
              },
              overrideAccess: true,
            })
          }
          committed++
        } catch (e) {
          if (errors.length < 10) errors.push((e as Error).message)
        }
      }
    }

    return Response.json({
      ok: true,
      commit,
      parsed: all.length,
      played: played.length,
      toCreate,
      toUpdate,
      committed,
      skippedReeks: [...skippedReeks],
      unmatchedTeams: [...unmatched].slice(0, 60),
      unmatchedCount: unmatched.size,
      samples,
      errors,
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
