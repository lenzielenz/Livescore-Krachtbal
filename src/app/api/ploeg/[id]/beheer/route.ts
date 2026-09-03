import { hasRole, isFederationLevel } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { ploegRechtzetten } from '@/lib/ploeg-rechtzetten'

// De ploegnaam en haar club rechtzetten vanaf de ploegpagina (enkel federatie/admin).
//
// Waarom naast /api/match/[id]/beheer: daar kom je aan een ploeg via een wedstrijd, en dat werkt
// enkel voor ploegen die er ook een hebben. Een ploeg die nog niet gespeeld heeft, of waarvan je
// net de agenda aan het nakijken bent, bereik je hier rechtstreeks. Beide schrijven via dezelfde
// gedeelde controle (ploegRechtzetten), dus wat de ene weigert, weigert de andere ook.

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const teamId = Number(id)
  if (!Number.isFinite(teamId)) return Response.json({ error: 'Ongeldige ploeg.' }, { status: 400 })

  let body: { naam?: unknown; clubId?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!isFederationLevel(user) && !hasRole(user, 'federatie')) {
      return Response.json({ error: 'Enkel federatie/admin.' }, { status: 403 })
    }

    const uit = await ploegRechtzetten(payload, teamId, { naam: body.naam, clubId: body.clubId })
    if (!uit.ok) return Response.json({ error: uit.fout }, { status: uit.status })
    return Response.json(uit)
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
