import { getAuthUser } from '@/lib/auth-user'
import { addInstant } from '@/lib/match-channel'
import { getPayloadClient } from '@/lib/payload-client'
import { isAdultReeks, type Reeks } from '@/lib/reeksen'
import { rateLimit } from '@/lib/sse-hub'
import { isTribuneOpen } from '@/lib/tribune'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 6 * 1024 * 1024 // 6 MB (de client verkleint al vóór upload)
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp'])

function displayName(user: { name?: string | null; email?: string | null }): string {
  const n = user.name?.trim()
  if (n) return n
  const local = user.email?.split('@')[0]?.trim()
  return local || 'Supporter'
}

// Upload van een blijvende supporterfoto. Vereist login; ENKEL op volwassen wedstrijden
// (safeguarding-grens: geen foto's op jeugdreeksen U12–U20); plaatsen kan enkel zolang de tribune open is.
// Na afloop blijft de foto als deel van de wedstrijdbeleving zichtbaar.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) return Response.json({ error: 'Ongeldig match-id' }, { status: 400 })

  const user = await getAuthUser()
  if (!user) return Response.json({ error: 'Log in om een foto te plaatsen.' }, { status: 401 })

  // Anti-spam: max ~4 foto's / 60 s per gebruiker.
  if (!rateLimit(`instant:${user.id}`, Number(process.env.INSTANT_MAX_PER_MIN) || 4, 60_000)) {
    return Response.json({ error: 'Even wachten — je plaatste net een foto.' }, { status: 429 })
  }

  const payload = await getPayloadClient()
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  if (!match) return Response.json({ error: 'Wedstrijd niet gevonden' }, { status: 404 })

  // Safeguarding: foto-tribune enkel op volwassen reeksen.
  if (!isAdultReeks(match.reeks as Reeks)) {
    return Response.json({ error: 'De foto-tribune staat enkel aan op volwassen wedstrijden.' }, { status: 403 })
  }
  // Enkel zolang de tribune open is (tijdens de match en tot 1u erna).
  if (!isTribuneOpen(match.status as string, (match.finishedAt as string | null | undefined) ?? null)) {
    return Response.json({ error: 'De tribune is gesloten.' }, { status: 403 })
  }

  let file: File | null = null
  try {
    const form = await req.formData()
    const f = form.get('photo')
    if (f && typeof f !== 'string') file = f as File
  } catch {
    return Response.json({ error: 'Ongeldige upload.' }, { status: 400 })
  }
  if (!file) return Response.json({ error: 'Geen foto meegegeven.' }, { status: 400 })
  if (!ALLOWED.has(file.type)) return Response.json({ error: 'Enkel JPG, PNG of WEBP.' }, { status: 415 })
  if (file.size > MAX_BYTES) return Response.json({ error: 'Foto te groot (max 6 MB).' }, { status: 413 })

  const buf = Buffer.from(await file.arrayBuffer())
  const authorName = displayName(user)
  // Legacy schema-veld: bewaar ver in de toekomst. Nieuwe code filtert foto's niet meer op verval.\n  const expiresAt = '2999-12-31T23:59:59.999Z'

  let created
  try {
    created = await payload.create({
      collection: 'match-instants',
      data: { match: matchId, author: user.id, authorName, expiresAt },
      file: { data: buf, mimetype: file.type, name: `instant-${matchId}-${Date.now()}.jpg`, size: buf.length },
      overrideAccess: true,
    })
  } catch {
    return Response.json({ error: 'Foto opslaan mislukt.' }, { status: 500 })
  }

  // Altijd een RELATIEVE same-origin URL: zo kan een (verkeerd ingestelde of http-)serverURL nooit
  // een absolute/mixed-content link maken die de browser blokkeert → anders blijft de foto onzichtbaar.
  const fname = (created as { filename?: string }).filename
  const url = fname ? `/api/match-instants/file/${encodeURIComponent(fname)}` : ((created as { url?: string | null }).url ?? '')
  const instant = { id: created.id as number, url, authorName, at: Date.now() }
  addInstant(matchId, instant)
  return Response.json({ instant })
}
