import { getPayloadClient } from '@/lib/payload-client'
import { buildTournamentState, type TMatchState } from '@/lib/tournament-engine'

export const dynamic = 'force-dynamic'

// Alles van één tornooidag (hoofdgroep) in één antwoord: de reeksen (tornooien met dezelfde
// groepsnaam) en al hun wedstrijden. Publiek en alleen-lezen — dit voedt de publieke groepspagina
// en het zelfaanpassende kantinescherm (dat elke paar seconden pollt, zoals het club-kantinescherm).
export type GroepMatch = TMatchState & { tournamentId: number; reeksNaam: string }

export async function GET(req: Request) {
  const url = new URL(req.url)
  const naam = url.searchParams.get('naam')?.trim() ?? ''
  if (!naam) return Response.json({ error: 'Geef een groepsnaam mee.' }, { status: 400 })

  try {
    const payload = await getPayloadClient()
    const res = await payload
      .find({ collection: 'tournaments', where: { groep: { equals: naam } }, sort: 'createdAt', depth: 0, limit: 50 })
      .catch(() => ({ docs: [] as { id: number }[] }))
    if (res.docs.length === 0) {
      return Response.json({ error: 'Geen tornooidag met deze naam.' }, { status: 404 })
    }

    const reeksen: { id: number; naam: string; status: string; format: string; teamCount: number | null; champion: string | null }[] = []
    const matches: GroepMatch[] = []
    for (const t of res.docs) {
      const state = await buildTournamentState(payload, t.id as number).catch(() => null)
      if (!state) continue
      reeksen.push({
        id: state.id,
        naam: state.name,
        status: state.status,
        format: state.format,
        teamCount: (t as { teamCount?: number | null }).teamCount ?? null,
        champion: state.champion ?? null,
      })
      const alle = [...state.rounds.flatMap((r) => r.matches), ...(state.thirdPlace ? [state.thirdPlace] : [])]
      for (const m of alle) {
        // Bye's (afgewerkt zonder twee ploegen) zijn planning-ruis — niet tonen op de kantine.
        if (m.status === 'finished' && (!m.home || !m.away)) continue
        matches.push({ ...m, tournamentId: state.id, reeksNaam: state.name })
      }
    }

    return Response.json({ naam, reeksen, matches, nu: Date.now() })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
