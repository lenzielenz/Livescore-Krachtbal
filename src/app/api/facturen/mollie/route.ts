import { mollieWebhook } from '@/lib/facturatie-server'
import { getPayloadClient } from '@/lib/payload-client'

// Webhook van Mollie (publiek: Mollie belt hier aan). Mollie stuurt enkel `id=tr_…`; de status vragen we zelf
// op bij Mollie met onze sleutel (lib/facturatie-server.ts → mollieWebhook), dus een vervalste oproep kan
// niets boeken. Altijd 200 voor een gekende of afgehandelde betaling, zodat Mollie niet blijft herhalen.
export async function POST(req: Request) {
  const tekst = await req.text().catch(() => '')
  const id = new URLSearchParams(tekst).get('id') ?? ''
  const payload = await getPayloadClient()
  const r = await mollieWebhook(payload, id)
  return r.ok ? new Response('ok') : new Response(r.error, { status: r.status })
}
