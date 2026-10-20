import webpush from 'web-push'

import type { Payload } from 'payload'

// Web Push (VAPID). De sleutels staan in de omgeving — NOOIT in de code:
//   - NEXT_PUBLIC_VAPID_PUBLIC_KEY : publieke sleutel (mag client-side, vandaar NEXT_PUBLIC).
//   - VAPID_PRIVATE_KEY            : private sleutel (server-only).
//   - VAPID_SUBJECT                : contact (mailto: of https://…), valt terug op een mailto.
// Zonder geconfigureerde sleutels doet alles hieronder bewust niets (no-op), zodat de app ook
// zónder push gewoon blijft werken.

let configured: boolean | null = null

function ensureConfigured(): boolean {
  if (configured !== null) return configured
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:info@krachtbal.be'
  if (!publicKey || !privateKey) {
    configured = false
    return false
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey)
    configured = true
  } catch {
    configured = false
  }
  return configured
}

/** Is web push server-side bruikbaar (sleutels aanwezig)? */
export function pushConfigured(): boolean {
  return ensureConfigured()
}

export interface PushPayload {
  title: string
  body: string
  /** Pad waar de melding naartoe linkt (bv. /match/123). */
  url?: string
  /** Tag: een nieuwere melding met dezelfde tag vervangt de vorige (geen stapel duplicaten). */
  tag?: string
}

interface StoredSub {
  id: number | string
  endpoint: string
  p256dh: string
  auth: string
}

// Gedeelde verzendlus: stuur naar een lijst abonnementen en ruim verlopen/uitgeschreven op (404/410).
async function sendToSubs(payload: Payload, subs: StoredSub[], notif: PushPayload): Promise<{ sent: number; pruned: number }> {
  if (subs.length === 0) return { sent: 0, pruned: 0 }
  const data = JSON.stringify(notif)
  let sent = 0
  let pruned = 0
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, data)
        sent += 1
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) {
          pruned += 1
          await payload.delete({ collection: 'push-subscriptions', id: s.id, overrideAccess: true }).catch(() => {})
        }
      }
    }),
  )
  return { sent, pruned }
}

/**
 * Stuurt één melding naar álle opgeslagen abonnementen. Een abonnement dat de browser niet meer
 * kent (404/410 — uitgeschreven of verlopen) wordt meteen opgeruimd zodat de lijst schoon blijft.
 * Faalt nooit hard: push is "best effort" en mag de aanroeper (bv. een match-hook) nooit breken.
 */
export async function sendPushToAll(payload: Payload, notif: PushPayload): Promise<{ sent: number; pruned: number }> {
  if (!ensureConfigured()) return { sent: 0, pruned: 0 }
  const res = await payload
    .find({ collection: 'push-subscriptions', depth: 0, limit: 10000, pagination: false })
    .catch(() => ({ docs: [] as StoredSub[] }))
  return sendToSubs(payload, res.docs as unknown as StoredSub[], notif)
}

/**
 * Stuurt een melding enkel naar de abonnees wiens account-club tot `clubIds` behoort — bv. de fans
 * van de scorende ploeg. Abonnementen zonder gekoppelde gebruiker (gasten) krijgen ze niet.
 */
export async function sendPushToClubs(payload: Payload, clubIds: (number | string | null | undefined)[], notif: PushPayload): Promise<{ sent: number; pruned: number }> {
  if (!ensureConfigured()) return { sent: 0, pruned: 0 }
  const ids = [...new Set(clubIds.filter((c): c is number | string => c != null))]
  if (ids.length === 0) return { sent: 0, pruned: 0 }
  const res = await payload
    .find({ collection: 'push-subscriptions', where: { 'user.club': { in: ids } }, depth: 0, limit: 10000, pagination: false })
    .catch(() => ({ docs: [] as StoredSub[] }))
  return sendToSubs(payload, res.docs as unknown as StoredSub[], notif)
}

/** Stuurt een melding naar bepaalde accounts (bv. de scheidsrechters die net een wedstrijd kregen). */
export async function sendPushToUsers(payload: Payload, userIds: (number | string | null | undefined)[], notif: PushPayload): Promise<{ sent: number; pruned: number }> {
  if (!ensureConfigured()) return { sent: 0, pruned: 0 }
  const ids = [...new Set(userIds.filter((u): u is number | string => u != null))]
  if (ids.length === 0) return { sent: 0, pruned: 0 }
  const res = await payload
    .find({ collection: 'push-subscriptions', where: { user: { in: ids } }, depth: 0, limit: 10000, pagination: false })
    .catch(() => ({ docs: [] as StoredSub[] }))
  return sendToSubs(payload, res.docs as unknown as StoredSub[], notif)
}
