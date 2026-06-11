import { getPayloadClient } from '@/lib/payload-client'

// Schrijft een toestel uit: verwijdert het abonnement met dit endpoint. Geen auth nodig — wie het
// endpoint van zijn eigen browser kent, mag zich uitschrijven (dezelfde drempel als inschrijven).
export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : ''
  if (!endpoint) return Response.json({ error: 'Geen endpoint.' }, { status: 400 })

  try {
    const payload = await getPayloadClient()
    await payload.delete({ collection: 'push-subscriptions', where: { endpoint: { equals: endpoint } }, overrideAccess: true })
    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
