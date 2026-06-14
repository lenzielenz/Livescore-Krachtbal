import { isFederationLevel } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'

export const dynamic = 'force-dynamic'

// Beheerder-only: wis je eigen (test)boosters van het bonusrad, zodat de radpagina weer toont hoe
// het er voor een verse winnaar uitziet.
export async function POST(req: Request) {
  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!isFederationLevel(user)) return Response.json({ error: 'Enkel voor beheerders.' }, { status: 403 })
    const userId = Number((user as { id: number }).id)
    await payload.update({ collection: 'users', id: userId, data: { pronostiekPower: null }, overrideAccess: true })
    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
