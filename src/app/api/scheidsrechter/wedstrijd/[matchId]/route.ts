import { hasRole, isFederationLevel, userOfficialId } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getOrCreateMatchSheet } from '@/lib/matchsheet-data'
import { getPayloadClient } from '@/lib/payload-client'

const relId = (rel: unknown): number | string | null =>
  rel == null ? null : typeof rel === 'object' ? (rel as { id: number | string }).id : (rel as number | string)

// Scheidsrechter-toewijzing per wedstrijd vanuit het scheidsrechtersportaal:
//  - claim:   een wedstrijd zónder scheidsrechter zelf opnemen (eigen dossier vereist).
//  - handoff: de eigen toegewezen wedstrijd doorgeven aan een andere scheidsrechter (of de
//             federatie wijst aan wie ze wil).
//  - release: de eigen toewijzing teruggeven aan de pool.
// De formele toekenning gebeurt uit de federatie; die kan altijd alles (overschrijven).
export async function POST(req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params
  const id = Number(matchId)
  if (!Number.isFinite(id)) return Response.json({ error: 'Ongeldig wedstrijd-id' }, { status: 400 })

  let body: { action?: string; targetOfficialId?: number | string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    const fed = isFederationLevel(user)
    if (!fed && !hasRole(user, 'scheidsrechter')) {
      return Response.json({ error: 'Enkel scheidsrechter/federatie.' }, { status: 403 })
    }

    const sheet = await getOrCreateMatchSheet(payload, id)
    const currentRef = relId(sheet.assignedReferee)
    const myOff = userOfficialId(user)
    const iAmAssigned = myOff != null && currentRef != null && String(myOff) === String(currentRef)

    const setReferee = async (officialId: number | null) => {
      await payload.update({ collection: 'matchsheets', id: sheet.id, data: { assignedReferee: officialId }, overrideAccess: true })
      return Response.json({ ok: true })
    }

    if (body.action === 'claim') {
      if (!fed && myOff == null) {
        return Response.json({ error: 'Je account is niet gekoppeld aan een scheidsrechtersdossier.' }, { status: 400 })
      }
      if (currentRef != null && !iAmAssigned) {
        return Response.json({ error: 'Deze wedstrijd heeft al een scheidsrechter.' }, { status: 409 })
      }
      if (myOff == null) return Response.json({ error: 'Koppel eerst je dossier.' }, { status: 400 })
      return setReferee(Number(myOff))
    }

    if (body.action === 'handoff') {
      if (!fed && !iAmAssigned) {
        return Response.json({ error: 'Enkel de toegewezen scheidsrechter of de federatie kan deze wedstrijd doorgeven.' }, { status: 403 })
      }
      const target = Number(body.targetOfficialId)
      if (!Number.isFinite(target)) return Response.json({ error: 'Kies een scheidsrechter.' }, { status: 400 })
      const off = await payload.findByID({ collection: 'officials', id: target, depth: 0 }).catch(() => null)
      if (!off) return Response.json({ error: 'Scheidsrechter niet gevonden.' }, { status: 404 })
      return setReferee(target)
    }

    if (body.action === 'release') {
      if (!fed && !iAmAssigned) {
        return Response.json({ error: 'Enkel de toegewezen scheidsrechter of de federatie kan dit teruggeven.' }, { status: 403 })
      }
      return setReferee(null)
    }

    return Response.json({ error: `Onbekende actie: ${body.action}` }, { status: 400 })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
