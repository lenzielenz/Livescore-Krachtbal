import { authUser, hasRole, userClubId } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { clubMagBewerken } from '@/lib/registratie'
import { attestFout, attestOpslaan, clubPloegen } from '@/lib/registratie-server'

const relId = (v: unknown): number | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null || !Number.isFinite(Number(id)) ? null : Number(id)
}

// Het doktersattest van een lid opladen (multipart: playerId + bestand). Enkel clubstaf, enkel voor
// een lid van de eigen club. Een nieuw attest vervangt het vorige (lib/registratie-server.ts).
export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  if (!hasRole(user, 'club-beheerder', 'club-medewerker')) {
    return Response.json({ error: 'Enkel de staf van een club laadt attesten op.' }, { status: 403 })
  }
  const clubId = userClubId(user)
  if (clubId == null) return Response.json({ error: 'Je account is niet aan een club gekoppeld.' }, { status: 400 })

  const form = await req.formData().catch(() => null)
  if (!form) return Response.json({ error: 'Ongeldige upload.' }, { status: 400 })
  const playerId = Number(form.get('playerId'))
  const bestand = form.get('bestand')
  if (!Number.isFinite(playerId)) return Response.json({ error: 'Ongeldig lid.' }, { status: 400 })
  const fout = attestFout(bestand)
  if (fout) return Response.json({ error: fout }, { status: 400 })

  try {
    const speler = await payload.findByID({ collection: 'players', id: playerId, depth: 0, overrideAccess: true }).catch(() => null)
    const ploegen = await clubPloegen(payload, clubId)
    if (!speler || !ploegen.has(relId(speler.team) ?? -1)) {
      return Response.json({ error: 'Lid niet gevonden in jouw club.' }, { status: 404 })
    }
    if (!clubMagBewerken(speler.registratieStatus as string)) {
      return Response.json({ error: 'Dit lid ligt bij de federatie ter goedkeuring.' }, { status: 409 })
    }

    const attestId = await attestOpslaan(payload, {
      playerId,
      clubId: Number(clubId),
      userId: Number(user.id),
      bestand: bestand as File,
      vorige: relId(speler.medischAttestBestand),
    })
    return Response.json({ ok: true, attestId })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
