import { hasRole, isFederationLevel } from '@/lib/access'
import { competitionWhere } from '@/lib/analyse-access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksCategorie, type Reeks } from '@/lib/reeksen'
import { dedupeKey } from '@/lib/dedupe'
import { cleanTeamName, isPlayed, parseResultsHtml } from '@/lib/results-import'
import { clubVanPloeg } from '@/lib/season-import'
import { buildFixedSimpleScore } from '@/lib/simple-score'

// Importeer officiële uitslagen (HTML-tabel-export). Maakt/voltooit wedstrijden met eindstand.
// Standaard PREVIEW (niets wegschrijven); met { commit: true } worden de wijzigingen toegepast.
// Enkel federatie/admin.

const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

export async function POST(req: Request) {
  let body: { text?: string; commit?: boolean; createTeams?: boolean }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }
  const text = String(body.text ?? '')
  const commit = body.commit === true
  const createTeams = body.createTeams === true
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
    const teamsRes = await payload.find({ collection: 'teams', where: competitionWhere(), depth: 0, limit: 5000 }).catch(() => ({ docs: [] as Record<string, unknown>[] }))
    // Naamsleutel zoals de seizoensimport en de opkuistool (lib/dedupe.ts): hoofdletters,
    // leestekens en spaties tellen niet mee. Met enkel kleine letters vond "Buffalo s Sijsele" onze
    // "Buffalo's Sijsele" niet, en maakte deze import er een tweede ploeg (én wedstrijden) bij.
    const byName = new Map<string, { id: number; reeks: string }[]>()
    for (const t of teamsRes.docs) {
      const key = dedupeKey(String((t as { name?: unknown }).name ?? ''))
      if (!key) continue
      const arr = byName.get(key) ?? []
      arr.push({ id: (t as { id: number }).id, reeks: String((t as { reeks?: unknown }).reeks ?? '') })
      byName.set(key, arr)
    }
    // Alle ploegen met die naam in die reeks, oudste eerst (dat is de ploeg van de kalender).
    const teamsInReeks = (name: string, reeks: string): number[] =>
      (byName.get(dedupeKey(name)) ?? []).filter((x) => x.reeks === reeks).map((x) => x.id).sort((a, b) => a - b)
    const resolveTeam = (name: string, reeks: string): number | null => teamsInReeks(name, reeks)[0] ?? null

    // Clubs indexeren (voor het aanmaken van ontbrekende ploegen).
    const clubsRes = await payload.find({ collection: 'clubs', where: competitionWhere(), depth: 0, limit: 5000 }).catch(() => ({ docs: [] as Record<string, unknown>[] }))
    const clubByName = new Map<string, number>()
    for (const c of clubsRes.docs) {
      const k = dedupeKey(String((c as { name?: unknown }).name ?? ''))
      // Bij dubbele clubs de oudste houden (de rest is opkuiswerk voor de opkuistool).
      const id = (c as { id: number }).id
      if (k && (!clubByName.has(k) || id < (clubByName.get(k) as number))) clubByName.set(k, id)
    }
    const ensureClub = async (clubName: string): Promise<number> => {
      const k = dedupeKey(clubName)
      const ex = clubByName.get(k)
      if (ex != null) return ex
      const created = await payload.create({ collection: 'clubs', data: { name: cleanTeamName(clubName) }, overrideAccess: true })
      const id = (created as { id: number }).id
      clubByName.set(k, id)
      return id
    }
    // Naam → club: dezelfde regel als de seizoensimport (poule-letter én "A-1"/"B-2" eraf). Dit was
    // een eigen kopie die enkel " A"/" B" kende, en maakte zo van "KBC St. Michiels A-1" een club.
    const clubNameOf = (teamName: string) => clubVanPloeg(teamName)
    let teamsCreated = 0
    const wouldCreate = new Set<string>()
    const fakeId = new Map<string, number>()
    // Zoekt de ploeg op; maakt ze (met club) aan indien gevraagd en in commit-modus. In preview
    // krijgt een nog-aan-te-maken ploeg een tijdelijk (negatief) id, zodat de wedstrijd meetelt.
    const ensureTeam = async (name: string, reeks: Reeks): Promise<number | null> => {
      const found = resolveTeam(name, reeks)
      if (found != null) return found
      if (!createTeams) return null
      if (!commit) {
        const fk = `${dedupeKey(name)}|${reeks}`
        wouldCreate.add(fk)
        let fid = fakeId.get(fk)
        if (fid == null) { fid = -(fakeId.size + 1); fakeId.set(fk, fid) }
        return fid
      }
      const clubId = await ensureClub(clubNameOf(name))
      const t = await payload.create({
        collection: 'teams',
        data: { name: cleanTeamName(name), reeks, category: reeksCategorie(reeks), club: clubId },
        overrideAccess: true,
      })
      const id = (t as { id: number }).id
      const arr = byName.get(dedupeKey(name)) ?? []
      arr.push({ id, reeks })
      byName.set(dedupeKey(name), arr)
      teamsCreated++
      return id
    }

    // Bestaande wedstrijden voor dedup (per reeks).
    const reeksSet = [...new Set(played.map((r) => r.reeks).filter((x): x is string => !!x))]
    const existingRes = reeksSet.length
      ? await payload.find({ collection: 'matches', where: { reeks: { in: reeksSet } }, depth: 0, limit: 8000 }).catch(() => ({ docs: [] as Record<string, unknown>[] }))
      : { docs: [] as Record<string, unknown>[] }
    // Per (reeks, thuis, uit) alle wedstrijden met hun datum: een uitslag hoort bij de wedstrijd
    // van die ploegen op (of binnen een week van) die datum — ook als de federatie een verplaatste
    // wedstrijd nog op de oude datum heeft staan, of als de UTC-datum een dag verschoven is.
    const perPaar = new Map<string, { id: number; date: string }[]>()
    for (const m of existingRes.docs) {
      if ((m as { analyseOnly?: boolean }).analyseOnly) continue
      const hid = rel((m as { homeTeam?: unknown }).homeTeam)
      const aid = rel((m as { awayTeam?: unknown }).awayTeam)
      const rk = String((m as { reeks?: unknown }).reeks ?? '')
      if (hid == null || aid == null) continue
      const k = `${rk}|${hid}|${aid}`
      const arr = perPaar.get(k) ?? []
      arr.push({ id: (m as { id: number }).id, date: String((m as { date?: unknown }).date ?? '') })
      perPaar.set(k, arr)
    }
    const WEEK_MS = 7 * 86_400_000
    const bestaandeWedstrijd = (reeks: string, home: string, away: string, datum: string): number | undefined => {
      const kandidaten = teamsInReeks(home, reeks).flatMap((h) => teamsInReeks(away, reeks).flatMap((a) => perPaar.get(`${reeks}|${h}|${a}`) ?? []))
      const doel = new Date(`${datum}T12:00:00Z`).getTime()
      return kandidaten
        .map((m) => ({ m, afstand: Math.abs(new Date(m.date).getTime() - doel) }))
        .filter((x) => Number.isFinite(x.afstand) && x.afstand <= WEEK_MS)
        .sort((a, b) => a.afstand - b.afstand || a.m.id - b.m.id)[0]?.m.id
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
      const reeks = r.reeks as Reeks
      const hid = await ensureTeam(r.home, reeks)
      const aid = await ensureTeam(r.away, reeks)
      if (hid == null) unmatched.add(r.home)
      if (aid == null) unmatched.add(r.away)
      if (hid == null || aid == null) continue

      const dateISO = r.date ? `${r.date}T${r.time && /^\d{1,2}:\d{2}/.test(r.time) ? (r.time.length === 5 ? `${r.time}:00` : r.time) : '00:00:00'}` : ''
      if (!dateISO) continue
      const existingId = bestaandeWedstrijd(r.reeks, r.home, r.away, r.date)
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
              data: { status: 'finished', simpleScore: buildFixedSimpleScore(op.home, op.away) as unknown as Record<string, unknown>, autoImported: true },
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
                simpleScore: buildFixedSimpleScore(op.home, op.away) as unknown as Record<string, unknown>,
                autoImported: true,
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
      teamsCreated,
      teamsToCreate: wouldCreate.size,
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
