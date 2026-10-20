import { authUser, hasRole, userClubId } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { clubMagBewerken } from '@/lib/registratie'
import { clubPloegen } from '@/lib/registratie-server'

const MAX_BYTES = 8 * 1024 * 1024
const TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])

const relId = (v: unknown): number | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null || !Number.isFinite(Number(id)) ? null : Number(id)
}

// Het doktersattest van een lid opladen (multipart: playerId + bestand). Enkel clubstaf, enkel voor
// een lid van de eigen club. Een nieuw attest vervangt het vorige; het oude bestand verdwijnt mee
// (medisch gegeven: niet langer bewaren dan nodig).
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
  if (!(bestand instanceof File)) return Response.json({ error: 'Kies een bestand.' }, { status: 400 })
  if (!TYPES.has(bestand.type)) return Response.json({ error: 'Enkel een PDF of een foto (JPG, PNG, WebP).' }, { status: 400 })
  if (bestand.size > MAX_BYTES) return Response.json({ error: 'Het bestand is groter dan 8 MB.' }, { status: 400 })

  try {
    const speler = await payload.findByID({ collection: 'players', id: playerId, depth: 0, overrideAccess: true }).catch(() => null)
    const ploegen = await clubPloegen(payload, clubId)
    if (!speler || !ploegen.has(relId(speler.team) ?? -1)) {
      return Response.json({ error: 'Lid niet gevonden in jouw club.' }, { status: 404 })
    }
    if (!clubMagBewerken(speler.registratieStatus as string)) {
      return Response.json({ error: 'Dit lid ligt bij de federatie ter goedkeuring.' }, { status: 409 })
    }

    const ext = bestand.type === 'application/pdf' ? 'pdf' : bestand.type.split('/')[1]
    const attest = await payload.create({
      collection: 'medische-attesten',
      data: { player: playerId, club: Number(clubId), geuploadDoor: Number(user.id) },
      // Geen originele bestandsnaam: die bevat vaak de naam van het kind of de dokter.
      file: { data: Buffer.from(await bestand.arrayBuffer()), mimetype: bestand.type, name: `attest-${playerId}-${Date.now()}.${ext}`, size: bestand.size },
      overrideAccess: true,
    })
    const vorige = relId(speler.medischAttestBestand)
    await payload.update({ collection: 'players', id: playerId, data: { medischAttestBestand: attest.id }, overrideAccess: true })
    if (vorige != null) {
      await payload.delete({ collection: 'medische-attesten', id: vorige, overrideAccess: true }).catch(() => null)
    }
    return Response.json({ ok: true, attestId: attest.id })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
