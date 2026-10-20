import { hasRole, isFederationLevel, userRoles } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { magOpstellingVoor } from '@/lib/club-functies'
import { clubsMayEditLineup, type MatchSheetStatus } from '@/lib/matchsheet-workflow'
import { buildRoster, getOrCreateMatchSheet, type Side } from '@/lib/matchsheet-data'
import { getPayloadClient } from '@/lib/payload-client'

const sideOf = (v: string | null): Side => (v === 'away' ? 'away' : 'home')

type Payload = Awaited<ReturnType<typeof getPayloadClient>>
type User = Awaited<ReturnType<typeof authUser>>

/**
 * Wie mag de opstelling van deze kant zien of bewerken? Federatie/admin en scheidsrechter altijd;
 * clubstaf enkel voor de kant van de eigen club. Geeft een foutantwoord terug, of null als het mag.
 *
 * Ook het LEZEN is afgeschermd: de roster bevat per speler de reden waarom hij niet mag spelen
 * (medisch attest, doktersverbod, knipjes). Dat is niet voor iedereen bestemd.
 */
async function geenToegang(payload: Payload, user: User, matchId: string, side: Side): Promise<Response | null> {
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  if (isFederationLevel(user) || hasRole(user, 'scheidsrechter')) return null
  // Clubstaf voor de kant van de eigen club; een coach voor zijn ploegen; de jeugdverantwoordelijke
  // voor de jeugdploegen van de club (lib/club-functies.ts).
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  const teamId = match ? (side === 'home' ? match.homeTeam : match.awayTeam) : null
  const team = teamId != null ? await payload.findByID({ collection: 'teams', id: typeof teamId === 'object' ? teamId.id : teamId, depth: 0 }).catch(() => null) : null
  if (team && magOpstellingVoor(user, { id: team.id, club: team.club, category: team.category })) return null
  return Response.json({ error: 'Je kan enkel de opstelling van je eigen ploeg bewerken.' }, { status: 403 })
}

// GET: selecteerbare roster voor één kant + de huidige opstelling op het blad.
export async function GET(req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params
  const side = sideOf(new URL(req.url).searchParams.get('side'))
  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    const fout = await geenToegang(payload, user, matchId, side)
    if (fout) return fout
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
  let body: {
    side?: string
    players?: { player: number; rugnummer?: number }[]
    saveFavorites?: boolean
    confirmed?: boolean
    favoriet?: { player?: unknown; aan?: boolean }
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }
  const side = sideOf(body.side ?? null)

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    // Een club-beheerder/-medewerker mag enkel de opstelling van de EIGEN club bewerken (multi-tenant isolatie).
    const fout = await geenToegang(payload, user, matchId, side)
    if (fout) return fout
    const roles = userRoles(user)

    // ⭐ Eén speler als favoriet (aan/uit): staat dan altijd bovenaan de selectielijst van de ploeg.
    // Bewaard in de vaste opstelling van de ploeg — dezelfde lijst als "★ Vaste opstelling".
    if (body.favoriet && typeof body.favoriet === 'object') {
      const roster = await buildRoster(payload, matchId, side)
      if (!roster) return Response.json({ error: 'Wedstrijd of ploeg niet gevonden.' }, { status: 404 })
      const spelerId = Number(body.favoriet.player)
      if (!roster.players.some((p) => p.id === spelerId)) {
        return Response.json({ error: 'Deze speler hoort niet bij deze ploeg.' }, { status: 400 })
      }
      const set = new Set(roster.favorites)
      if (body.favoriet.aan) set.add(spelerId)
      else set.delete(spelerId)
      await payload.update({ collection: 'teams', id: roster.teamId, data: { vasteOpstellingIds: [...set].join(',') }, overrideAccess: true })
      return Response.json({ ok: true, favorites: [...set] })
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

    // Dezelfde controle als het scherm, maar nu op de server: anders kon een club met een eigen
    // verzoek een speler van een andere ploeg, of een niet-speelgerechtigde speler, opstellen.
    // Iemand van een andere ploeg kan niemand opstellen; een geblokkeerde speler (geen vergunning,
    // knipjes, te hoge categorie) enkel de scheidsrechter of de federatie (override, zie lib/lineup.ts).
    const roster = await buildRoster(payload, matchId, side)
    if (!roster) return Response.json({ error: 'Wedstrijd of ploeg niet gevonden.' }, { status: 404 })
    const perSpeler = new Map(roster.players.map((p) => [p.id, p]))
    if (new Set(rows.map((r) => r.player)).size !== rows.length) {
      return Response.json({ error: 'Een speler staat twee keer in de opstelling.' }, { status: 400 })
    }
    for (const r of rows) {
      const p = perSpeler.get(r.player)
      if (!p) return Response.json({ error: 'Een gekozen speler hoort niet bij deze ploeg.' }, { status: 400 })
      if (p.selectability.level === 'block' && !referee) {
        return Response.json(
          { error: `${p.name} mag niet spelen: ${p.selectability.reasons.join(' ')}` },
          { status: 400 },
        )
      }
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
