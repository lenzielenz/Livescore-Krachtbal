import { hasRole, isFederationLevel } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { extractPdfText, parseReeksindeling, teamKey } from '@/lib/reeksindeling-import'
import { reeksCategorie, type Reeks } from '@/lib/reeksen'

// Volledige reeksindeling importeren: maak per reeks de ploegen aan (met hun club) zoals ze in de
// PDF staan. Standaard PREVIEW; met commit=true wordt alles weggeschreven. Federatie/admin.
// Bestaande ploegen (zelfde naam + reeks) blijven behouden; ontbrekende worden aangemaakt.
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
      if (file && typeof file !== 'string') text = extractPdfText(Buffer.from(await file.arrayBuffer()))
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

    const entries = parseReeksindeling(text)
    if (entries.length === 0) return Response.json({ error: 'Geen reeksindeling herkend in deze PDF.' }, { status: 400 })

    // Bestaande clubs (op genormaliseerde naam) en ploegen (op naam+reeks) indexeren.
    const [clubsRes, teamsRes] = await Promise.all([
      payload.find({ collection: 'clubs', depth: 0, limit: 8000 }).catch(() => ({ docs: [] as Record<string, unknown>[] })),
      payload.find({ collection: 'teams', depth: 0, limit: 8000 }).catch(() => ({ docs: [] as Record<string, unknown>[] })),
    ])
    const clubByKey = new Map<string, number>()
    for (const c of clubsRes.docs) {
      const k = teamKey(String((c as { name?: unknown }).name ?? ''))
      if (k && !clubByKey.has(k)) clubByKey.set(k, (c as { id: number }).id)
    }
    const teamByKeyReeks = new Set<string>()
    for (const t of teamsRes.docs) {
      const k = teamKey(String((t as { name?: unknown }).name ?? ''))
      const rk = String((t as { reeks?: unknown }).reeks ?? '')
      if (k) teamByKeyReeks.add(`${k}|${rk}`)
    }

    // Gewenste ploegen (naam + reeks) en clubs uit de PDF verzamelen.
    const wantClubs = new Map<string, string>() // key → weergavenaam
    const wantTeams = new Map<string, { name: string; reeks: string; thuis: string | null }>()
    for (const e of entries) {
      const ck = teamKey(e.team)
      if (ck) wantClubs.set(ck, e.team)
      const thuis = e.day && e.time ? `${e.day} ${e.time}` : null
      for (const reeks of e.reeksen) {
        wantTeams.set(`${ck}|${reeks}`, { name: e.team, reeks, thuis })
      }
    }

    const clubsToCreate = [...wantClubs.entries()].filter(([k]) => !clubByKey.has(k))
    const teamsToCreate = [...wantTeams.entries()].filter(([k]) => !teamByKeyReeks.has(k))
    const samples = teamsToCreate.slice(0, 15).map(([, t]) => `${t.name} · ${t.reeks}`)

    let createdClubs = 0
    let createdTeams = 0
    const errors: string[] = []
    if (commit) {
      // Eerst de ontbrekende clubs.
      for (const [k, name] of clubsToCreate) {
        try {
          const doc = await payload.create({ collection: 'clubs', data: { name }, overrideAccess: true })
          clubByKey.set(k, doc.id as number)
          createdClubs++
        } catch (e) {
          if (errors.length < 10) errors.push((e as Error).message)
        }
      }
      // Dan de ontbrekende ploegen, gekoppeld aan hun club.
      for (const [, t] of teamsToCreate) {
        const clubId = clubByKey.get(teamKey(t.name))
        if (clubId == null) continue
        try {
          await payload.create({
            collection: 'teams',
            data: {
              name: t.name,
              reeks: t.reeks as Reeks,
              category: reeksCategorie(t.reeks as Reeks),
              club: clubId,
              ...(t.thuis ? { thuisUur: t.thuis } : {}),
            },
            overrideAccess: true,
          })
          createdTeams++
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
      existingTeams: wantTeams.size - teamsToCreate.length,
      createdClubs,
      createdTeams,
      samples,
      errors,
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
