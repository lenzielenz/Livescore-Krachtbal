import { getAuthUser } from '@/lib/auth-user'
import { addShoutout } from '@/lib/match-channel'
import { getPayloadClient } from '@/lib/payload-client'
import { rateLimit } from '@/lib/sse-hub'

export const dynamic = 'force-dynamic'

const MAX_LEN = 200

// Toon-naam komt SERVER-SIDE uit het account (nooit door de client meegegeven), zodat niemand
// zich als iemand anders kan voordoen.
function displayName(user: { name?: string | null; email?: string | null }): string {
  const n = user.name?.trim()
  if (n) return n
  const local = user.email?.split('@')[0]?.trim()
  return local || 'Supporter'
}

// Profielfoto's staan op de scorebord/live-tribune — zelfde reden als displayName hierboven: uit
// het account zelf, nooit door de client meegegeven. `payload.auth()` geeft het gebruikersobject
// zonder gepopulariseerde relaties terug (photo = een kaal media-id), dus die zoeken we hier apart
// op. Geen profielfoto? Dan valt de tribune terug op initialen (zie components/Avatar.tsx).
async function photoUrlFor(payload: Awaited<ReturnType<typeof getPayloadClient>>, user: { photo?: unknown }): Promise<string | null> {
  const raw = user.photo
  if (raw && typeof raw === 'object') {
    const url = (raw as { url?: unknown }).url
    return typeof url === 'string' ? url : null
  }
  const id = typeof raw === 'number' ? raw : null
  if (id == null) return null
  const media = await payload.findByID({ collection: 'media', id, depth: 0 }).catch(() => null)
  const url = media && typeof media === 'object' ? (media as { url?: unknown }).url : null
  return typeof url === 'string' ? url : null
}

// Live shoutout (ingelogde supporter). Vereist login (i.t.t. de publieke emoji-reacties), met
// per-gebruiker rate limit en lengtebegrenzing. Berichten worden persistent op de wedstrijd
// bewaard (zie match-channel), zodat ze niet verdwijnen wanneer (even) niemand kijkt.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) return Response.json({ error: 'Ongeldig match-id' }, { status: 400 })

  const user = await getAuthUser()
  if (!user) return Response.json({ error: 'Log in om mee te juichen.' }, { status: 401 })

  // Anti-spam: max ~5 berichten / 10 s per gebruiker.
  if (!rateLimit(`shout:${user.id}`, Number(process.env.SHOUT_MAX_PER_10S) || 5, 10_000)) {
    return Response.json({ error: 'Rustig aan — even wachten.' }, { status: 429 })
  }

  let body: { text?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  // Witruimte normaliseren (geen newlines/tab-spam) en hard begrenzen.
  const text = String(body.text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LEN)
  if (!text) return Response.json({ error: 'Leeg bericht' }, { status: 400 })

  const payload = await getPayloadClient()
  const photoUrl = await photoUrlFor(payload, user)
  const shout = addShoutout(matchId, displayName(user), text, photoUrl)
  return Response.json({ ok: Boolean(shout) })
}
