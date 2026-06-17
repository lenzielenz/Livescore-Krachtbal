import { hasRole, isFederationLevel, userClubId, userRoles } from '@/lib/access'
import { authUser, matchSideClubs } from '@/lib/api-auth'
import { clubsMayEditLineup, type MatchSheetStatus } from '@/lib/matchsheet-workflow'
import { buildRoster, getOrCreateMatchSheet, type Side } from '@/lib/matchsheet-data'
import { getPayloadClient } from '@/lib/payload-client'

const sideOf = (v: string | null): Side => (v === 'away' ? 'away' : 'home')

// GET: selecteerbare roster voor één kant + de huidige opstelling op het blad.
export async function GET(req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params
  const side = sideOf(new URL(req.url).searchParams.get('side'))
  try {
    const payload = await getPayloadClient()
    const roster = await buildRoster(payload, matchId, side)
    if (!roster) return Response.json({ error: 'Wedstrijd of ploeg niet gevonden.' }, { status: 404 })
    const sheet = await getOrCreateMatchSheet(payload, matchId)
    const lineupKey = side === 'home' ? 'homeLineup' : 'awayLineup'
    const confirmKey = side === 'home' ? 'homeLineupConfirmed' : 'awayLineupConfirmed'
    const current = ((sheet[lineupKey] as { player?: number | { id: number }; rugnummer?: number }[]) ?? []).map(
      (r) => ({
        player: typeof r.player === 'object' ? r.player?.id : r.player,
        rugnummer: r.rugnummer,
      }),
    )
    return Response.json({ ...roster, status: sheet.status, current, confirmed: Boolean(sheet[confirmKey]) })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}

// POST: bewaart de opstelling van één kant op het blad.
export async function POST(req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params
  let body: { side?: string; players?: { player: number; rugnummer?: number }[]; saveFavorites?: boolean; confirmed?: boolean }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }
  const side = sideOf(body.side ?? null)

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })

    const roles = userRoles(user)
    const mayEdit =
      isFederationLevel(user) || hasRole(user, 'scheidsrechter', 'club-beheerder', 'club-medewerker')
    if (!mayEdit) return Response.json({ error: 'Geen rechten voor de opstelling.' }, { status: 403 })

    // Een club-beheerder/-medewerker mag enkel de opstelling van de EIGEN club bewerken (multi-tenant isolatie).
    if (!isFederationLevel(user) && hasRole(user, 'club-beheerder', 'club-medewerker') && !hasRole(user, 'scheidsrechter')) {
      const clubs = await matchSideClubs(payload, matchId)
      const need = side === 'home' ? clubs.home : clubs.away
      const own = userClubId(user)
      if (need == null || own == null || String(need) !== String(own)) {
        return Response.json({ error: 'Je kan enkel de opstelling van je eigen ploeg bewerken.' }, { status: 403 })
      }
    }

    const sheet = await getOrCreateMatchSheet(payload, matchId)
    const status = sheet.status as MatchSheetStatus
    // Clubs mogen enkel in concept wijzigen; scheidsrechter/federatie mogen ook later (override).
    const referee = isFederationLevel(user) || hasRole(user, 'scheidsrechter')
    if (!clubsMayEditLineup(status) && !referee) {
      return Response.json(
        { error: 'De opstelling is vergrendeld; enkel scheidsrechter/federatie kan nu nog wijzigen.' },
        { status: 409 },
      )
    }

    // Geen gelijke rugnummers binnen één opstelling (reglement).
    const rows = (body.players ?? []).map((p) => ({
      player: Number(p.player),
      rugnummer: p.rugnummer != null ? Number(p.rugnummer) : undefined,
      deelgenomen: false,
      ibGecontroleerd: false,
    }))
    const nummers = rows.map((r) => r.rugnummer).filter((n): n is number => typeof n === 'number')
    if (new Set(nummers).size !== nummers.length) {
      return Response.json({ error: 'Twee spelers hebben hetzelfde rugnummer.' }, { status: 400 })
    }

    const lineupKey = side === 'home' ? 'homeLineup' : 'awayLineup'
    const confirmKey = side === 'home' ? 'homeLineupConfirmed' : 'awayLineupConfirmed'
    // De opstelling bewaren én — indien meegegeven — de bevestiging (lock) zetten of weghalen.
    // Het bevestigen is een bewuste extra stap bovenop het bewaren, zodat zichtbaar is dat de
    // club de opstelling als definitief beschouwt (zonder dat ze daarna nog vastligt: ontgrendelen kan).
    const data: Record<string, unknown> = { [lineupKey]: rows }
    if (typeof body.confirmed === 'boolean') data[confirmKey] = body.confirmed
    await payload.update({
      collection: 'matchsheets',
      id: sheet.id,
      data,
      overrideAccess: true,
    })

    // Optioneel: deze selectie onthouden als "vaste opstelling" van de ploeg, zodat ze bij
    // de volgende wedstrijd automatisch wordt voorgesteld (de coach kan dan nog aanpassen).
    let favoritesSaved = false
    if (body.saveFavorites) {
      const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
      const teamRel = match ? (side === 'home' ? match.homeTeam : match.awayTeam) : null
      const teamId = typeof teamRel === 'object' && teamRel ? teamRel.id : teamRel
      if (teamId != null) {
        await payload.update({
          collection: 'teams',
          id: teamId,
          data: { vasteOpstellingIds: rows.map((r) => r.player).join(',') },
          overrideAccess: true,
        })
        favoritesSaved = true
      }
    }

    return Response.json({ ok: true, saved: rows.length, status, roles, favoritesSaved, confirmed: typeof body.confirmed === 'boolean' ? body.confirmed : undefined })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
