import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { rateLimit } from '@/lib/sse-hub'

export const dynamic = 'force-dynamic'

const MAX_PHOTO_BYTES = 6 * 1024 * 1024 // 6 MB (de client verkleint al vóór upload)
const ALLOWED_PHOTO = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_CAPTION_LEN = 80

function displayName(user: { name?: string | null; email?: string | null }): string {
  const n = user.name?.trim()
  if (n) return n
  const local = user.email?.split('@')[0]?.trim()
  return local || 'Supporter'
}

// Upload van een bezoekersfoto bij een nieuwsbericht (bv. "Dag van de Sportclub"). Vereist login;
// enkel toegelaten zolang het artikel gepubliceerd is, `photosEnabled` aanstaat, en de ingestelde
// bewaartermijn (`photosExpireAt`) nog niet voorbij is — erna sluit het venster net als de
// foto-tribune bij een wedstrijd.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const newsId = Number(id)
  if (!Number.isFinite(newsId)) return Response.json({ error: 'Ongeldig artikel-id' }, { status: 400 })

  const user = await getAuthUser()
  if (!user) return Response.json({ error: 'Log in om een foto toe te voegen.' }, { status: 401 })

  if (!rateLimit(`news-photo:${user.id}`, Number(process.env.NEWS_PHOTO_MAX_PER_MIN) || 6, 60_000)) {
    return Response.json({ error: 'Even wachten — je plaatste net iets.' }, { status: 429 })
  }

  const payload = await getPayloadClient()
  const news = await payload.findByID({ collection: 'news', id: newsId, depth: 0 }).catch(() => null)
  if (!news || !news.published) return Response.json({ error: 'Artikel niet gevonden.' }, { status: 404 })
  if (!news.photosEnabled) return Response.json({ error: "Foto's zijn niet toegelaten bij dit artikel." }, { status: 403 })

  const expiresAt = news.photosExpireAt as string | null | undefined
  if (!expiresAt) return Response.json({ error: "Dit artikel heeft geen bewaartermijn ingesteld." }, { status: 500 })
  if (new Date(expiresAt).getTime() <= Date.now()) {
    return Response.json({ error: "Het venster om foto's toe te voegen is gesloten." }, { status: 403 })
  }

  let file: File | null = null
  let caption = ''
  try {
    const form = await req.formData()
    const p = form.get('photo')
    if (p && typeof p !== 'string') file = p as File
    const c = form.get('caption')
    if (typeof c === 'string') caption = c.trim().slice(0, MAX_CAPTION_LEN)
  } catch {
    return Response.json({ error: 'Ongeldige upload.' }, { status: 400 })
  }
  if (!file) return Response.json({ error: 'Geen foto meegegeven.' }, { status: 400 })
  if (!ALLOWED_PHOTO.has(file.type)) return Response.json({ error: 'Enkel JPG, PNG of WEBP.' }, { status: 415 })
  if (file.size > MAX_PHOTO_BYTES) return Response.json({ error: 'Foto te groot (max 6 MB).' }, { status: 413 })

  const buf = Buffer.from(await file.arrayBuffer())
  const uploaderName = displayName(user)

  let created
  try {
    created = await payload.create({
      collection: 'news-photos',
      data: { news: newsId, uploader: user.id, uploaderName, caption: caption || undefined, expiresAt },
      file: { data: buf, mimetype: file.type, name: `news-photo-${newsId}-${Date.now()}.jpg`, size: buf.length },
      overrideAccess: true,
    })
  } catch {
    return Response.json({ error: 'Foto opslaan mislukt.' }, { status: 500 })
  }

  // Opportunistisch opruimen: verwijder meteen alle reeds verlopen foto's van dit artikel. Vangt
  // gevallen op tussen twee cron-runs — of als die nooit ingesteld raakte (zie /api/cron/expire-news-photos).
  payload
    .delete({
      collection: 'news-photos',
      where: { and: [{ news: { equals: newsId } }, { expiresAt: { less_than: new Date().toISOString() } }] },
      overrideAccess: true,
    })
    .catch(() => {})

  const fname = (created as { filename?: string }).filename
  const url = fname ? `/api/news-photos/file/${encodeURIComponent(fname)}` : ((created as { url?: string | null }).url ?? '')
  return Response.json({ photo: { id: created.id as number, url, uploaderName, caption: caption || null } })
}
