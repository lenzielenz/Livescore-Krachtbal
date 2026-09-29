import { getAuthUser } from '@/lib/auth-user'
import { toggleShoutLike } from '@/lib/match-channel'
import { rateLimit } from '@/lib/sse-hub'

export const dynamic = 'force-dynamic'

// Like togglen op een tribune-bericht: ingelogd, één like per persoon per bericht (nog eens tikken
// haalt 'm weg). Geen tekst, dus geen lengtebeperking — enkel een anti-spam rate limit.
export async function POST(req: Request, { params }: { params: Promise<{ id: string; shoutId: string }> }) {
  const { id, shoutId } = await params
  const matchId = Number(id)
  const sid = Number(shoutId)
  if (!Number.isFinite(matchId) || !Number.isFinite(sid)) {
    return Response.json({ error: 'Ongeldig id' }, { status: 400 })
  }

  const user = await getAuthUser()
  if (!user) return Response.json({ error: 'Log in om te liken.' }, { status: 401 })

  if (!rateLimit(`shout-like:${user.id}`, Number(process.env.SHOUT_MAX_PER_10S) || 5, 10_000)) {
    return Response.json({ error: 'Rustig aan — even wachten.' }, { status: 429 })
  }

  const shout = toggleShoutLike(matchId, Number(user.id), sid)
  if (!shout) return Response.json({ error: 'Bericht niet gevonden.' }, { status: 404 })
  return Response.json({ ok: true, likes: shout.likes, liked: shout.likedBy.includes(Number(user.id)) })
}
