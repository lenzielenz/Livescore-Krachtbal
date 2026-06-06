import { hasRole, isFederationLevel } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { extractPdfTextSpaced, parseReeksindelingTeams, teamKey } from '@/lib/reeksindeling-import'
import { reeksCategorie, type Reeks } from '@/lib/reeksen'

// Volledige reeksindeling importeren: club + ploeg + reeks + thuisuur uit de PDF. Standaard
// PREVIEW; commit=true schrijft weg. Bestaande clubs/ploegen worden hergebruikt (op naam);
// het thuisuur wordt ook op bestaande ploegen gezet. Federatie/admin.
export async function POST(req: Request) {
  let commit = false
  let seizoen = ''
  let text = ''
  try {
    const ct = req.headers.get('content-type') || ''
    if (ct.includes('multipart/form-data')) {
      const form = await req.formData()
      commit = String(form.get('commit')) === 'true'
      seizoen = String(form.get('seizoen') ?? '')
      const file = form.get('pdf')
      if (file && typeof file !== 'string') text = extractPdfTextSpaced(Buffer.from(await file.arrayBuffer()))
    }
  } catch {
    return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  }
  if (!text) return Response.json({ error: 'Geen PDF ontvangen.' }, { status: 400 })

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!isFederationLevel(user) && !hasRole(user, 'federatie')) {
      return Response.json({ error: 'Enkel federatie/admin mag importeren.' }, { status: 403 })
    }

    const entries = parseReeksindelingTeams(text)
    if (entries.length === 0) return Response.json({ error: 'Geen reeksindeling herkend in deze PDF.' }, { status: 400 })

    const [clubsRes, teamsRes] = await Promise.all([
      payload.find({ collection: 'clubs', depth: 0, limit: 8000 }).catch(() => ({ docs: [] as Record<string, unknown>[] })),
      payload.find({ collection: 'teams', depth: 0, limit: 8000 }).catch(() => ({ docs: [] as Record<string, unknown>[] })),
    ])
    const clubByKey = new Map<string, number>()
    for (const c of clubsRes.docs) {
      const k = teamKey(String((c as { name?: unknown }).name ?? ''))
      if (k && !clubByKey.has(k)) clubByKey.set(k, (c as { id: number }).id)
    }
    const teamByKeyReeks = new Map<string, { id: number; thuis: string }>()
    for (const t of teamsRes.docs) {
      const k = teamKey(String((t as { name?: unknown }).name ?? ''))
      const rk = String((t as { reeks?: unknown }).reeks ?? '')
      if (k) teamByKeyReeks.set(`${k}|${rk}`, { id: (t as { id: number }).id, thuis: String((t as { thuisUur?: unknown }).thuisUur ?? '') })
    }

    // Gewenste clubs/ploegen uit de PDF (ontdubbeld).
    const wantClubs = new Map<string, string>()
    const wantTeams = new Map<string, { name: string; club: string; reeks: string; thuis: string }>()
    for (const e of entries) {
      wantClubs.set(teamKey(e.club), e.club)
      wantTeams.set(`${teamKey(e.team)}|${e.reeks}`, { name: e.team, club: e.club, reeks: e.reeks, thuis: `${e.day} ${e.time}` })
    }

    const clubsToCreate = [...wantClubs.entries()].filter(([k]) => !clubByKey.has(k))
    const teamsToCreate = [...wantTeams.entries()].filter(([k]) => !teamByKeyReeks.has(k))
    const thuisUpdates = [...wantTeams.entries()].filter(([k, t]) => {
      const ex = teamByKeyReeks.get(k)
      return ex != null && t.thuis && ex.thuis !== t.thuis
    })
    const samples = teamsToCreate.slice(0, 15).map(([, t]) => `${t.name} · ${t.reeks} · ${t.thuis}`)

    let createdClubs = 0
    let createdTeams = 0
    let thuisSet = 0
    const errors: string[] = []
    if (commit) {
      for (const [k, name] of clubsToCreate) {
        try {
          const doc = await payload.create({ collection: 'clubs', data: { name }, overrideAccess: true })
          clubByKey.set(k, doc.id as number)
          createdClubs++
        } catch (e) {
          if (errors.length < 10) errors.push((e as Error).message)
        }
      }
      for (const [, t] of teamsToCreate) {
        const clubId = clubByKey.get(teamKey(t.club))
        if (clubId == null) continue
        try {
          await payload.create({
            collection: 'teams',
            data: { name: t.name, reeks: t.reeks as Reeks, category: reeksCategorie(t.reeks as Reeks), club: clubId, thuisUur: t.thuis },
            overrideAccess: true,
          })
          createdTeams++
        } catch (e) {
          if (errors.length < 10) errors.push((e as Error).message)
        }
      }
      for (const [, t] of thuisUpdates) {
        const ex = teamByKeyReeks.get(`${teamKey(t.name)}|${t.reeks}`)
        if (ex == null) continue
        try {
          await payload.update({ collection: 'teams', id: ex.id, data: { thuisUur: t.thuis }, overrideAccess: true })
          thuisSet++
        } catch (e) {
          if (errors.length < 10) errors.push((e as Error).message)
        }
      }
    }

    return Response.json({
      ok: true,
      commit,
      seizoen,
      entries: entries.length,
      clubsToCreate: clubsToCreate.length,
      teamsToCreate: teamsToCreate.length,
      thuisToSet: thuisUpdates.length,
      createdClubs,
      createdTeams,
      thuisSet,
      samples,
      errors,
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
