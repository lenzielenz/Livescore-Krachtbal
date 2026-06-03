import { authUser, requireRole } from '@/lib/api-auth'
import { CATEGORIES, type Category } from '@/lib/categories'
import { getPayloadClient } from '@/lib/payload-client'
import { createTournament } from '@/lib/tournament-engine'

// Maak een nieuw tornooi aan. Body: { name, category, method, slots }.
// `slots` is de geordende loting (lengte = macht van 2; null = bye). De client berekent de slots
// (toggle = geschud, manueel = door de gebruiker geschikt); de server bouwt het schema.
export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const name = String(body.name ?? '').trim()
  const category = String(body.category ?? '') as Category
  const method = body.method === 'manual' ? 'manual' : 'auto'
  const format = body.format === 'roundrobin' ? 'roundrobin' : 'knockout'
  const slots = Array.isArray(body.slots)
    ? body.slots.map((s) => (typeof s === 'string' && s.trim() ? s.trim() : null))
    : []

  if (!name) return Response.json({ error: 'Geef het tornooi een naam.' }, { status: 400 })
  if (!CATEGORIES.includes(category)) return Response.json({ error: 'Ongeldige categorie.' }, { status: 400 })

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    const denied = requireRole(user, 'scorekeeper', 'scheidsrechter')
    if (denied) return denied
    const id = await createTournament(payload, { name, category, method, slots, format })
    return Response.json({ id })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
