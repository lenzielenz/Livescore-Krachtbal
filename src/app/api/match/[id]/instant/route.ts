import { getAuthUser } from '@/lib/auth-user'
import { addInstant } from '@/lib/match-channel'
import { getPayloadClient } from '@/lib/payload-client'
import { isAdultReeks, type Reeks } from '@/lib/reeksen'
import { rateLimit } from '@/lib/sse-hub'
import { fotoVensterOpen } from '@/lib/tribune'

export const dynamic = 'force-dynamic'

const MAX_PHOTO_BYTES = 6 * 1024 * 1024 // 6 MB (de client verkleint al vóór upload)
const MAX_VIDEO_BYTES = 30 * 1024 * 1024 // 30 MB — een kort tribunemomentje, geen volledige wedstrijd
const ALLOWED_PHOTO = new Set(['image/jpeg', 'image/png', 'image/webp'])
const ALLOWED_VIDEO = new Set(['video/mp4', 'video/webm', 'video/quicktime'])
const VIDEO_EXT: Record<string, string> = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' }

function displayName(user: { name?: string | null; email?: string | null }): string {
  const n = user.name?.trim()
  if (n) return n
  const local = user.email?.split('@')[0]?.trim()
  return local || 'Supporter'
}

// Upload van een blijvende supportersfoto of -video. Vereist login; ENKEL op volwassen
// wedstrijden (safeguarding-grens: geen foto's/video's op jeugdreeksen U12–U20); plaatsen kan
// enkel zolang de tribune open is. Na afloop blijft het moment als deel van de wedstrijdbeleving
// zichtbaar.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) return Response.json({ error: 'Ongeldig match-id' }, { status: 400 })

  const user = await getAuthUser()
  if (!user) return Response.json({ error: 'Log in om iets te plaatsen.' }, { status: 401 })

  let file: File | null = null
  let kind: 'photo' | 'video' = 'photo'
  try {
    const form = await req.formData()
    const p = form.get('photo')
    const v = form.get('video')
    if (v && typeof v !== 'string') {
      file = v as File
      kind = 'video'
    } else if (p && typeof p !== 'string') {
      file = p as File
    }
  } catch {
    return Response.json({ error: 'Ongeldige upload.' }, { status: 400 })
  }
  if (!file) return Response.json({ error: 'Geen bestand meegegeven.' }, { status: 400 })

  // Anti-spam: foto's mogen vaker (klein bestand); video's zijn groter, dus een strenger tempo.
  const rateKey = kind === 'video' ? `instant-video:${user.id}` : `instant:${user.id}`
  const ratePerMin = kind === 'video' ? Number(process.env.INSTANT_VIDEO_MAX_PER_MIN) || 1 : Number(process.env.INSTANT_MAX_PER_MIN) || 4
  const rateWindowMs = kind === 'video' ? 300_000 : 60_000
  if (!rateLimit(rateKey, ratePerMin, rateWindowMs)) {
    return Response.json({ error: 'Even wachten — je plaatste net iets.' }, { status: 429 })
  }

  const payload = await getPayloadClient()
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  if (!match) return Response.json({ error: 'Wedstrijd niet gevonden' }, { status: 404 })

  // Safeguarding: foto-/video-tribune enkel op volwassen reeksen.
  if (!isAdultReeks(match.reeks as Reeks)) {
    return Response.json({ error: 'De tribune staat enkel aan op volwassen wedstrijden.' }, { status: 403 })
  }
  // Mag vanaf een uur vóór de aftrap (al klaarzetten) tot de tribune sluit (tijdens de match en
  // tot 1u erna). Dezelfde regel als de knop op het scorebord — zie fotoVensterOpen.
  const magAlPosten = fotoVensterOpen({
    volwassen: true,
    status: match.status as string,
    finishedAt: (match.finishedAt as string | null | undefined) ?? null,
    date: (match.date as string | null | undefined) ?? null,
  })
  if (!magAlPosten) {
    return Response.json({ error: 'De tribune is gesloten.' }, { status: 403 })
  }

  let mimetype: string
  let ext: string
  const maxBytes = kind === 'video' ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES
  if (kind === 'video') {
    if (!ALLOWED_VIDEO.has(file.type)) return Response.json({ error: 'Enkel MP4, WEBM of MOV.' }, { status: 415 })
    mimetype = file.type
    ext = VIDEO_EXT[file.type]
  } else {
    if (!ALLOWED_PHOTO.has(file.type)) return Response.json({ error: 'Enkel JPG, PNG of WEBP.' }, { status: 415 })
    mimetype = file.type
    ext = 'jpg'
  }
  if (file.size > maxBytes) {
    return Response.json(
      { error: kind === 'video' ? `Video te groot (max ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MB).` : 'Foto te groot (max 6 MB).' },
      { status: 413 },
    )
  }

  const buf = Buffer.from(await file.arrayBuffer())
  const authorName = displayName(user)
  // Legacy schema-veld: bewaar ver in de toekomst. Nieuwe code filtert momenten niet meer op verval.
  const expiresAt = '2999-12-31T23:59:59.999Z'

  let created
  try {
    created = await payload.create({
      collection: 'match-instants',
      data: { match: matchId, author: user.id, authorName, kind, expiresAt },
      file: { data: buf, mimetype, name: `instant-${matchId}-${Date.now()}.${ext}`, size: buf.length },
      overrideAccess: true,
    })
  } catch {
    return Response.json({ error: kind === 'video' ? 'Video opslaan mislukt.' : 'Foto opslaan mislukt.' }, { status: 500 })
  }

  // Altijd een RELATIEVE same-origin URL: zo kan een (verkeerd ingestelde of http-)serverURL nooit
  // een absolute/mixed-content link maken die de browser blokkeert → anders blijft het moment onzichtbaar.
  const fname = (created as { filename?: string }).filename
  const url = fname ? `/api/match-instants/file/${encodeURIComponent(fname)}` : ((created as { url?: string | null }).url ?? '')
  const instant = { id: created.id as number, url, authorName, at: Date.now(), kind }
  addInstant(matchId, instant)
  return Response.json({ instant })
}
