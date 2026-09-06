import { hasRole, isFederationLevel, userOfficialId } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { delegationQrValue } from '@/lib/referee-credentials'
import { dateStrBE } from '@/lib/datetime'

// Maakt een tijdelijke 'ziek'-delegatie aan: een scheidsrechter genereert een QR + code met
// een vervaldatum, die een vervanger kan gebruiken om de wedstrijd vrij te geven in zijn plaats.
export async function POST(req: Request) {
  let body: { validUntil?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!isFederationLevel(user) && !hasRole(user, 'scheidsrechter')) {
      return Response.json({ error: 'Enkel scheidsrechters.' }, { status: 403 })
    }
    const officialId = userOfficialId(user)
    if (officialId == null) {
      return Response.json(
        { error: 'Je account is nog niet gekoppeld aan een scheidsrechtersdossier. Contacteer de federatie.' },
        { status: 400 },
      )
    }

    // Vervaltijd = einde van de gekozen dag (default vandaag). We rekenen in UTC: ruim genoeg
    // voor een speeldag en houdt de code automatisch geldig tot de wedstrijd gespeeld is.
    // Belgische dag als standaard: de UTC-dag zou 's avonds al een dag te ver staan.
    const dateStr = (body.validUntil || dateStrBE()).slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return Response.json({ error: 'Ongeldige datum.' }, { status: 400 })
    }
    const expiresAtMs = new Date(`${dateStr}T23:59:59.999Z`).getTime()
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      return Response.json({ error: 'Kies een datum vandaag of later.' }, { status: 400 })
    }

    const secret = process.env.PAYLOAD_SECRET || ''
    const qr = delegationQrValue(secret, officialId, expiresAtMs)
    return Response.json({ ok: true, qr, validUntil: new Date(expiresAtMs).toISOString() })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
