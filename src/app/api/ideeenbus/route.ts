import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { clientIp, rateLimit } from '@/lib/sse-hub'

export const dynamic = 'force-dynamic'

type Category = 'idea' | 'change' | 'problem'
const CATEGORIES = new Set<Category>(['idea', 'change', 'problem'])

// De client verkleint een screenshot al vóór upload (zie IdeasForm.tsx) — deze grens is een
// server-side vangnet, niet de normale bestandsgrootte.
const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024
const ALLOWED_SCREENSHOT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function text(value: FormDataEntryValue | null, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export async function POST(request: Request) {
  const ip = clientIp(request)
  if (!rateLimit(`ideas:${ip}`, Number(process.env.IDEAS_MAX_PER_HOUR) || 5, 60 * 60 * 1000)) {
    return Response.json({ error: 'Je hebt net al meerdere inzendingen verstuurd. Probeer later opnieuw.' }, { status: 429 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return Response.json({ error: 'Ongeldige inzending.' }, { status: 400 })
  }

  // Honeypot: echte bezoekers zien/vullen dit veld nooit.
  if (text(form.get('website'), 200)) return Response.json({ ok: true })

  const category = text(form.get('category'), 20)
  const subject = text(form.get('subject'), 100)
  const message = text(form.get('message'), 3000)
  const suppliedName = text(form.get('name'), 100)
  const suppliedEmail = text(form.get('email'), 180)
  const pageUrl = text(form.get('pageUrl'), 500)

  if (!CATEGORIES.has(category as Category)) return Response.json({ error: 'Kies wat je wilt doorgeven.' }, { status: 400 })
  if (subject.length < 3) return Response.json({ error: 'Geef je idee een duidelijk onderwerp.' }, { status: 400 })
  if (message.length < 10) return Response.json({ error: 'Vertel iets meer over je idee of aanpassing.' }, { status: 400 })
  if (suppliedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(suppliedEmail)) {
    return Response.json({ error: 'Vul een geldig e-mailadres in.' }, { status: 400 })
  }

  const screenshotField = form.get('screenshot')
  const screenshotFile = screenshotField && typeof screenshotField !== 'string' ? (screenshotField as File) : null
  if (screenshotFile) {
    if (!ALLOWED_SCREENSHOT_TYPES.has(screenshotFile.type)) {
      return Response.json({ error: 'Screenshot moet JPG, PNG of WEBP zijn.' }, { status: 415 })
    }
    if (screenshotFile.size > MAX_SCREENSHOT_BYTES) {
      return Response.json({ error: 'Screenshot is te groot (max 8 MB).' }, { status: 413 })
    }
  }

  const user = await getAuthUser()
  const name = suppliedName || String(user?.name ?? '').trim()
  const email = suppliedEmail || String(user?.email ?? '').trim()
  const payload = await getPayloadClient()

  // Screenshot eerst apart opslaan (upload-relatie): lukt dit niet, dan gaat de tekst-inzending
  // toch door — een idee zonder screenshot is beter dan helemaal geen inzending.
  let screenshotId: number | undefined
  if (screenshotFile) {
    try {
      const buf = Buffer.from(await screenshotFile.arrayBuffer())
      const created = await payload.create({
        collection: 'idea-screenshots',
        data: {},
        file: { data: buf, mimetype: screenshotFile.type, name: `ideeenbus-${Date.now()}.jpg`, size: buf.length },
        overrideAccess: true,
      })
      screenshotId = created.id
    } catch (error) {
      console.error('[ideeenbus] Screenshot opslaan mislukt', error)
    }
  }

  try {
    await payload.create({
      collection: 'ideas',
      data: {
        category: category as Category,
        subject,
        message,
        name: name || undefined,
        email: email || undefined,
        submittedBy: user?.id ?? undefined,
        pageUrl: pageUrl || undefined,
        status: 'new',
        screenshot: screenshotId,
      },
      overrideAccess: true,
    })
  } catch (error) {
    console.error('[ideeenbus] Opslaan mislukt', error)
    return Response.json({ error: 'Opslaan is niet gelukt. Probeer het opnieuw.' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
