import { isFederationLevel } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { changeCategory, planSchedule, redrawTournament, renameTeam, renameTournament, setVeldCount } from '@/lib/tournament-engine'

// Een beker/tornooi verwijderen — enkel de federatie/admin (dezelfde rol die ze aanmaakt).
// De beforeDelete-hook op de Tournaments-collectie ruimt het hele wedstrijdschema mee op.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tournamentId = Number(id)
  if (!Number.isFinite(tournamentId)) return Response.json({ error: 'Ongeldig id' }, { status: 400 })

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, _req)
    if (!isFederationLevel(user)) {
      return Response.json({ error: 'Enkel de federatie kan een beker/tornooi verwijderen.' }, { status: user ? 403 : 401 })
    }
    await payload.delete({ collection: 'tournaments', id: tournamentId, overrideAccess: true })
    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}

// Beheer-aanpassingen aan een bestaand tornooi (schrijffouten en herloting) — federatie/admin.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tournamentId = Number(id)
  if (!Number.isFinite(tournamentId)) return Response.json({ error: 'Ongeldig id' }, { status: 400 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!isFederationLevel(user)) {
      return Response.json({ error: 'Enkel de federatie kan een tornooi aanpassen.' }, { status: user ? 403 : 401 })
    }
    const actie = String(body.actie ?? '')
    switch (actie) {
      case 'naam':
        await renameTournament(payload, tournamentId, String(body.naam ?? ''))
        break
      case 'ploegnaam':
        await renameTeam(payload, tournamentId, String(body.van ?? ''), String(body.naar ?? ''))
        break
      case 'categorie':
        await changeCategory(payload, tournamentId, String(body.categorie ?? ''))
        break
      case 'velden':
        // Aantal velden van de tornooidag (dagprogramma + veldtoewijzing).
        await setVeldCount(payload, tournamentId, Number(body.velden))
        break
      case 'planning': {
        // Manuele planning (round-robin): [{ home, away, plannedAt? }] in speelvolgorde.
        const wedstrijden = Array.isArray(body.wedstrijden)
          ? (body.wedstrijden as Record<string, unknown>[]).map((w) => ({
              home: String(w?.home ?? '').trim(),
              away: String(w?.away ?? '').trim(),
              plannedAt: typeof w?.plannedAt === 'string' && w.plannedAt ? w.plannedAt : null,
            }))
          : []
        await planSchedule(payload, tournamentId, wedstrijden)
        break
      }
      case 'herloting': {
        const slots = Array.isArray(body.slots)
          ? body.slots.map((x) => (typeof x === 'string' && x.trim() ? x.trim() : null))
          : []
        await redrawTournament(payload, tournamentId, slots)
        break
      }
      default:
        return Response.json({ error: `Onbekende actie: ${actie}` }, { status: 400 })
    }
    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
