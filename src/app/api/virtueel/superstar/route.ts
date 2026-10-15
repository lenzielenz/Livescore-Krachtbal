import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { superstarStand, type BalId, type Worp } from '@/lib/virtueel-superstar'

export const dynamic = 'force-dynamic'

// Het klassement van Superstar (afstandwerpen in de kelder), over heel het platform: de beste
// worp van elke werper per bal, met je eigen besten. Enkel lezen; een worp zelf gaat langs
// POST /api/virtueel/sporen (soort "werp"), waar de server de afstand uitrekent.

type Doc = Record<string, unknown>
const relId = (v: unknown): number | null => {
  const raw = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

export async function GET(req: Request) {
  const payload = await getPayloadClient()
  const ik = await authUser(payload, req).catch(() => null)
  const r = await payload
    .find({ collection: 'virtuele-sporen', where: { soort: { equals: 'werp' } }, sort: '-createdAt', depth: 0, limit: 5000, overrideAccess: true })
    .catch(() => ({ docs: [] as Doc[] }))
  const docs = r.docs as unknown as Doc[]
  // De clubnamen in één keer.
  const clubIds = [...new Set(docs.map((d) => relId(d.club)).filter((x): x is number => x != null))]
  const clubs = clubIds.length
    ? await payload.find({ collection: 'clubs', where: { id: { in: clubIds } }, depth: 0, limit: clubIds.length, overrideAccess: true }).catch(() => ({ docs: [] as Doc[] }))
    : { docs: [] as Doc[] }
  const clubNaam = new Map((clubs.docs as unknown as Doc[]).map((c) => [Number(c.id), String(c.name ?? '')]))
  const worpen: Worp[] = docs.map((d) => {
    const w = (d.waarde ?? {}) as { bal?: BalId; afstand?: number }
    const c = relId(d.club)
    return { naam: String(d.authorName ?? 'Supporter'), club: c != null ? (clubNaam.get(c) ?? null) : null, bal: w.bal as BalId, afstand: Number(w.afstand) || 0, wanneer: String(d.createdAt ?? ''), auteur: relId(d.author) }
  })
  return Response.json(superstarStand(worpen.filter((w) => w.bal), ik ? (ik.id as number) : null), { headers: { 'Cache-Control': 'no-store' } })
}
