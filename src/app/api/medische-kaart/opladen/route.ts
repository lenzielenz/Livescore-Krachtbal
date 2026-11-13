import { authUser } from '@/lib/api-auth'
import { kaartenOpladen } from '@/lib/medische-kaart-server'
import { getPayloadClient } from '@/lib/payload-client'
import { clientIp, rateLimit } from '@/lib/sse-hub'

// Ingevulde medische kaarten opladen (multipart): bestanden[] (foto's of scans), datum (van de keuring,
// optioneel), voorLid (optioneel: de pagina achter de QR of Mijn profiel). De QR op elke foto zegt bij
// welk lid de kaart hoort (lib/medische-kaart-server.ts). Antwoord: per bestand gelukt of waarom niet.
const MAX_BESTANDEN = 60

export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Log in om kaarten op te laden.' }, { status: 401 })
  if (!rateLimit(`kaart-opladen:${clientIp(req)}`, 30, 60_000)) return Response.json({ error: 'Even geduld: te veel uploads na elkaar.' }, { status: 429 })
  const form = await req.formData().catch(() => null)
  if (!form) return Response.json({ error: 'Ongeldige upload.' }, { status: 400 })
  const bestanden = form.getAll('bestanden').filter((f): f is File => f instanceof File && f.size > 0)
  if (!bestanden.length) return Response.json({ error: 'Kies minstens één foto of scan.' }, { status: 400 })
  if (bestanden.length > MAX_BESTANDEN) return Response.json({ error: `Hooguit ${MAX_BESTANDEN} kaarten in één keer.` }, { status: 400 })
  const voorLid = form.get('voorLid') ? Number(form.get('voorLid')) : null
  try {
    const resultaten = await kaartenOpladen(payload, user as never, bestanden, {
      datum: form.get('datum') ? String(form.get('datum')) : null,
      voorLid: voorLid != null && Number.isSafeInteger(voorLid) ? voorLid : null,
    })
    return Response.json({ ok: true, resultaten })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
