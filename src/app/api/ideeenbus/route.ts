import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { clientIp, rateLimit } from '@/lib/sse-hub'

export const dynamic = 'force-dynamic'

const CATEGORIES = new Set(['idea', 'change', 'problem'])

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export async function POST(request: Request) {
  const ip = clientIp(request)
  if (!rateLimit(`ideas:${ip}`, Number(process.env.IDEAS_MAX_PER_HOUR) || 5, 60 * 60 * 1000)) {
    return Response.json({ error: 'Je hebt net al meerdere inzendingen verstuurd. Probeer later opnieuw.' }, { status: 429 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Ongeldige inzending.' }, { status: 400 })
  }

  // Honeypot: echte bezoekers zien/vullen dit veld nooit.
  if (text(body.website, 200)) return Response.json({ ok: true })

  const category = text(body.category, 20)
  const subject = text(body.subject, 100)
  const message = text(body.message, 3000)
  const suppliedName = text(body.name, 100)
  const suppliedEmail = text(body.email, 180)
  const pageUrl = text(body.pageUrl, 500)

  if (!CATEGORIES.has(category)) return Response.json({ error: 'Kies wat je wilt doorgeven.' }, { status: 400 })
  if (subject.length < 3) return Response.json({ error: 'Geef je idee een duidelijk onderwerp.' }, { status: 400 })
  if (message.length < 10) return Response.json({ error: 'Vertel iets meer over je idee of aanpassing.' }, { status: 400 })
  if (suppliedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(suppliedEmail)) {
    return Response.json({ error: 'Vul een geldig e-mailadres in.' }, { status: 400 })
  }

  const user = await getAuthUser()
  const name = suppliedName || String(user?.name ?? '').trim()
  const email = suppliedEmail || String(user?.email ?? '').trim()
  const payload = await getPayloadClient()

  try {
    await payload.create({
      collection: 'ideas' as never,
      data: {
        category,
        subject,
        message,
        name: name || undefined,
        email: email || undefined,
        submittedBy: user?.id ?? undefined,
        pageUrl: pageUrl || undefined,
        status: 'new',
      } as never,
      overrideAccess: true,
    })
  } catch (error) {
    console.error('[ideeenbus] Opslaan mislukt', error)
    return Response.json({ error: 'Opslaan is niet gelukt. Probeer het opnieuw.' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
