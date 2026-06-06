import { authUser, hasRole, isFederationLevel, userClubId } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'

type Weer = 'zonnig' | 'bewolkt' | 'regen' | 'wind' | 'sneeuw' | 'mist'
const WEER_VALUES: Weer[] = ['zonnig', 'bewolkt', 'regen', 'wind', 'sneeuw', 'mist']
const isWeer = (v: unknown): v is Weer => typeof v === 'string' && (WEER_VALUES as string[]).includes(v)

// Een trainingssessie (aanwezigheid + weer + duur) opslaan. Admin/federatie of club-beheerder
// (die enkel voor een ploeg van de eigen club).
export async function POST(req: Request) {
  let body: {
    datum?: string
    team?: number | null
    duurMinuten?: unknown
    weer?: string
    temperatuur?: unknown
    aanwezigen?: unknown
    notitie?: string
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const datum = body.datum ? new Date(body.datum) : new Date()
  if (Number.isNaN(datum.getTime())) return Response.json({ error: 'Ongeldige datum.' }, { status: 400 })

  const teamId = body.team != null && Number.isFinite(Number(body.team)) ? Number(body.team) : null
  const aanwezigen = Array.isArray(body.aanwezigen)
    ? [...new Set(body.aanwezigen.map((v) => Number(v)).filter((n) => Number.isFinite(n)))]
    : []
  const num = (v: unknown): number | undefined => {
    if (v === '' || v == null) return undefined
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  }
  const weer: Weer | undefined = isWeer(body.weer) ? body.weer : undefined

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!isFederationLevel(user) && !hasRole(user, 'club-beheerder')) {
      return Response.json({ error: 'Enkel club-beheerder/federatie.' }, { status: 403 })
    }
    // Club-beheerder mag enkel een training van een ploeg van de eigen club ingeven.
    if (!isFederationLevel(user) && teamId != null) {
      const clubId = userClubId(user)
      const team = await payload.findByID({ collection: 'teams', id: teamId, depth: 0 }).catch(() => null)
      const teamClub = team ? (typeof team.club === 'object' && team.club ? team.club.id : team.club) : null
      if (clubId == null || teamClub == null || String(teamClub) !== String(clubId)) {
        return Response.json({ error: 'Deze ploeg hoort niet bij jouw club.' }, { status: 403 })
      }
    }

    const doc = await payload.create({
      collection: 'trainingen',
      data: {
        datum: datum.toISOString(),
        ...(teamId != null ? { team: teamId } : {}),
        ...(num(body.duurMinuten) != null ? { duurMinuten: num(body.duurMinuten) } : {}),
        ...(weer ? { weer } : {}),
        ...(num(body.temperatuur) != null ? { temperatuur: num(body.temperatuur) } : {}),
        aanwezigen,
        ...(typeof body.notitie === 'string' && body.notitie.trim() ? { notitie: body.notitie.trim() } : {}),
      },
      overrideAccess: true,
    })
    return Response.json({ ok: true, id: doc.id })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
