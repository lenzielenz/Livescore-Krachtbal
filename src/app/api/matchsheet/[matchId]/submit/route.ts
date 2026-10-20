import { hasRole, isFederationLevel } from '@/lib/access'
import { refereeMayHandleMatch, type AuthedUser } from '@/lib/api-auth'
import { submitMatchSheet } from '@/lib/submit'
import { getPayloadClient } from '@/lib/payload-client'

// Scheidsrechter dient het blad in: PDF + mail + federatie-upload + status 'ingediend'.
export async function POST(req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params
  try {
    const payload = await getPayloadClient()
    const { user } = await payload.auth({ headers: req.headers })
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })

    // Enkel de scheidsrechter van deze wedstrijd (of de federatie) dient in.
    const referee = isFederationLevel(user) || (hasRole(user, 'scheidsrechter') && (await refereeMayHandleMatch(payload, user as unknown as AuthedUser, matchId)))
    if (!referee) return Response.json({ error: 'Enkel de scheidsrechter van deze wedstrijd of de federatie kan indienen.' }, { status: 403 })

    const result = await submitMatchSheet(payload, matchId, user)
    return Response.json(result, { status: result.ok ? 200 : 400 })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
