import { userClubId } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'

export const dynamic = 'force-dynamic'

// Locatie voor het header-weerbericht: ingelogd met een club → de gemeente/coördinaten van die
// club; anders (uitgelogd of geen locatie) → de standaardplaats Brugge.
const BRUGGE = { lat: 51.2093, lon: 3.2247, place: 'Brugge' }

export async function GET(req: Request) {
  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    const cid = user ? userClubId(user) : null
    if (cid != null) {
      const club = await payload.findByID({ collection: 'clubs', id: cid as number, depth: 0 }).catch(() => null)
      const lat = Number((club as { lat?: unknown } | null)?.lat)
      const lng = Number((club as { lng?: unknown } | null)?.lng)
      const plaats = typeof (club as { plaats?: unknown } | null)?.plaats === 'string' ? String((club as { plaats?: string }).plaats).trim() : ''
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return Response.json({ lat, lon: lng, place: plaats || String((club as { name?: unknown } | null)?.name ?? 'Mijn club') })
      }
    }
    return Response.json(BRUGGE)
  } catch {
    return Response.json(BRUGGE)
  }
}
