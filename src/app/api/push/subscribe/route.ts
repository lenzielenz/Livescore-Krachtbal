import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { pushConfigured } from '@/lib/push'

// Slaat een web-push-abonnement op (één per browser/toestel, uniek op endpoint). Open voor iedereen
// — ook een bezoeker zonder account mag zich op meldingen abonneren. We koppelen het wél aan de
// ingelogde gebruiker als die er is. Bestaat het endpoint al, dan verversen we enkel de sleutels.
export async function POST(req: Request) {
  if (!pushConfigured()) {
    return Response.json({ error: 'Push is niet geconfigureerd op de server.' }, { status: 503 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  // De client mag de hele PushSubscription doorsturen, of al uitgepakt {endpoint, p256dh, auth}.
  const sub = (body.subscription as Record<string, unknown> | undefined) ?? body
  const endpoint = typeof sub.endpoint === 'string' ? sub.endpoint : ''
  const keys = (sub.keys as Record<string, unknown> | undefined) ?? sub
  const p256dh = typeof keys.p256dh === 'string' ? keys.p256dh : ''
  const auth = typeof keys.auth === 'string' ? keys.auth : ''
  if (!endpoint || !p256dh || !auth) {
    return Response.json({ error: 'Onvolledig abonnement.' }, { status: 400 })
  }

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    const userId = typeof user?.id === 'number' ? user.id : undefined
    const userAgent = req.headers.get('user-agent') ?? undefined

    const existing = await payload.find({
      collection: 'push-subscriptions',
      where: { endpoint: { equals: endpoint } },
      limit: 1,
      depth: 0,
    })

    const data = { endpoint, p256dh, auth, ...(userId ? { user: userId } : {}), ...(userAgent ? { userAgent } : {}) }
    if (existing.docs[0]) {
      await payload.update({ collection: 'push-subscriptions', id: existing.docs[0].id, data, overrideAccess: true })
    } else {
      await payload.create({ collection: 'push-subscriptions', data, overrideAccess: true })
    }
    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
