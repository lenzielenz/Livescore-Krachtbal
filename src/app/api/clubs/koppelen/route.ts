import { hasRole, isFederationLevel } from '@/lib/access'
import { competitionWhere } from '@/lib/analyse-access'
import { authUser } from '@/lib/api-auth'
import { planClubKoppeling, type Club, type Ploeg } from '@/lib/clubs-koppelen'
import { getPayloadClient } from '@/lib/payload-client'

// Ploegen aan hun echte club koppelen (federatie/admin). Standaard VOORBEELD; commit=true voert uit.
//
// Waarom dit bestaat: de import leidde de club af uit de ploegnaam zonder "A-1"/"B-2" te kennen,
// waardoor één vereniging als drie clubs in de database stond — elk met een leeg logo. De
// afleiding is hersteld (clubVanPloeg); dit zet de bestaande data recht. De planning zelf is puur en
// getest (lib/clubs-koppelen.ts); hier gebeurt enkel het lezen en het schrijven.
//
// Uitvoeren, in deze volgorde, zodat er nooit iets aan een verdwenen club blijft hangen:
//   1. ontbrekende clubs aanmaken;
//   2. ploegen verhuizen;
//   3. van elke leeg geraakte club-per-ploeg alles wat er nog naar wees (spelers, accounts,
//      trainingen, …) mee laten verhuizen;
//   4. pas dan die lege clubs verwijderen.
const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

/** Alle collecties met een verwijzing naar clubs, met het veld waarin die zit. */
const VERWIJZINGEN: { collection: 'players' | 'trainingen' | 'oefeningen' | 'sessiesjablonen' | 'news' | 'users' | 'tournaments'; veld: string }[] = [
  { collection: 'players', veld: 'club' },
  { collection: 'trainingen', veld: 'club' },
  { collection: 'oefeningen', veld: 'club' },
  { collection: 'sessiesjablonen', veld: 'club' },
  { collection: 'news', veld: 'club' },
  { collection: 'users', veld: 'club' },
  { collection: 'tournaments', veld: 'hostClub' },
]

export async function POST(req: Request) {
  let commit = false
  try {
    const body = (await req.json()) as { commit?: boolean }
    commit = body.commit === true
  } catch {
    /* voorbeeld is de standaard */
  }

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!isFederationLevel(user) && !hasRole(user, 'federatie')) {
      return Response.json({ error: 'Enkel federatie/admin.' }, { status: 403 })
    }

    const [teamsRes, clubsRes] = await Promise.all([
      payload.find({ collection: 'teams', where: competitionWhere(), depth: 0, limit: 8000 }).catch(() => ({ docs: [] as Record<string, unknown>[] })),
      payload.find({ collection: 'clubs', where: competitionWhere(), depth: 0, limit: 8000 }).catch(() => ({ docs: [] as Record<string, unknown>[] })),
    ])
    const ploegen: Ploeg[] = teamsRes.docs.map((t) => ({
      id: (t as { id: number }).id,
      naam: String((t as { name?: unknown }).name ?? ''),
      clubId: rel((t as { club?: unknown }).club),
    }))
    const clubs: Club[] = clubsRes.docs.map((c) => {
      const d = c as { id: number; name?: unknown; logo?: unknown; logoUrl?: unknown }
      return {
        id: d.id,
        naam: String(d.name ?? ''),
        heeftLogo: rel(d.logo) != null || (typeof d.logoUrl === 'string' && d.logoUrl.trim() !== ''),
      }
    })

    const plan = planClubKoppeling(ploegen, clubs)

    let verhuisd = 0
    let aangemaakt = 0
    let verwijderd = 0
    const errors: string[] = []
    const fout = (e: unknown) => {
      if (errors.length < 10) errors.push((e as Error).message)
    }

    if (commit) {
      // 1 · Ontbrekende clubs aanmaken; onthoud hun id op naam.
      const nieuwId = new Map<string, number>()
      for (const naam of plan.nieuweClubs) {
        try {
          const doc = await payload.create({ collection: 'clubs', data: { name: naam }, overrideAccess: true })
          nieuwId.set(naam, (doc as { id: number }).id)
          aangemaakt += 1
        } catch (e) {
          fout(e)
        }
      }
      const doelId = (v: { naarClubId: number | null; naarClubNaam: string }) => v.naarClubId ?? nieuwId.get(v.naarClubNaam) ?? null

      // 2 · Ploegen verhuizen.
      for (const v of plan.verhuizingen) {
        const naar = doelId(v)
        if (naar == null) {
          if (errors.length < 10) errors.push(`Geen doelclub voor "${v.ploegNaam}".`)
          continue
        }
        try {
          await payload.update({ collection: 'teams', id: v.ploegId, data: { club: naar }, overrideAccess: true })
          verhuisd += 1
        } catch (e) {
          fout(e)
        }
      }

      // 3 + 4 · Leeg geraakte clubs: eerst alles wat er nog naar wijst meeverhuizen, dan weg.
      for (const c of plan.opTeRuimen) {
        const naar = doelId(c)
        if (naar == null) continue
        for (const { collection, veld } of VERWIJZINGEN) {
          await payload
            .update({ collection, where: { [veld]: { equals: c.id } }, data: { [veld]: naar }, overrideAccess: true })
            .catch(() => {})
        }
        try {
          await payload.delete({ collection: 'clubs', id: c.id, overrideAccess: true })
          verwijderd += 1
        } catch (e) {
          fout(e)
        }
      }
    }

    return Response.json({ ok: true, commit, plan, verhuisd, aangemaakt, verwijderd, errors })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
