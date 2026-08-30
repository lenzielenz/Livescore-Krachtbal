import { FIELD, toMeters } from '@/lib/field'
import type { VeldMaten } from '@/lib/field'
import { getPayloadClient } from '@/lib/payload-client'

import { cvAuthorized } from '../../../cv-auth'

export const dynamic = 'force-dynamic'

// Sync-brug voor de computer-vision-pipeline: zet de BESTAANDE manuele tags (throws met gameClock
// en de video-offsets per helft op de wedstrijd) om naar weak labels voor training. Puur lezen —
// dit endpoint muteert niets. Contract afgesproken met de Python-kant (fase 0): per throw
// { half, gameClock, video_time_s, event_type, worp_type, outcome, landing, speler }, plus een
// rapport { totaal, syncbaar, nietSyncbaar }. video_time_s = offset van die helft + gameClock;
// ontbreekt de offset van die helft, dan is de worp niet syncbaar (video_time_s = null).
//
// Auth: zelfde als POST /api/cv/events — Bearer CV_BRIDGE_TOKEN of federatie-login.

const relId = (rel: unknown): number | string | null => {
  if (rel == null) return null
  if (typeof rel === 'object') return (rel as { id: number | string }).id
  return rel as number | string
}

const teamNaam = (rel: unknown): string | null => {
  if (typeof rel !== 'object' || rel === null) return null
  const team = rel as { name?: string | null; displayTitle?: string | null }
  return team.name ?? team.displayTitle ?? null
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) {
    return Response.json({ error: 'Ongeldig match-id' }, { status: 400 })
  }

  const payload = await getPayloadClient()
  if (!(await cvAuthorized(payload, req))) {
    return Response.json({ error: 'Geen toegang.' }, { status: 401 })
  }

  const match = await payload
    .findByID({ collection: 'matches', id: matchId, depth: 1 })
    .catch(() => null)
  if (!match) {
    return Response.json({ error: 'Wedstrijd niet gevonden.' }, { status: 404 })
  }

  const goalAreaDepth = match.goalAreaDepth ?? FIELD.defaultGoalAreaDepthM
  // Echte terreinmaten (opgemeten, per wedstrijd): bepalen de meters van elke landing.
  const maten: Partial<VeldMaten> = {
    ...(match.veldBreedte != null ? { breedteM: match.veldBreedte } : {}),
    ...(match.veldSpeelveld != null ? { speelveldM: match.veldSpeelveld } : {}),
  }
  const videoOffsetH1 = typeof match.videoOffsetH1 === 'number' ? match.videoOffsetH1 : null
  const videoOffsetH2 = typeof match.videoOffsetH2 === 'number' ? match.videoOffsetH2 : null
  const homeTeamId = relId(match.homeTeam)

  // depth 1: speler mee ingeladen voor het rugnummer. Sorteren op id = registratievolgorde.
  const throws = await payload.find({
    collection: 'throws',
    where: { match: { equals: matchId } },
    depth: 1,
    sort: 'id',
    pagination: false,
    limit: 0,
    overrideAccess: true,
  })

  const labels = throws.docs.map((t) => {
    const half = t.period ?? 1
    const offset = half === 2 ? videoOffsetH2 : videoOffsetH1
    const gameClock = t.gameClock ?? 0
    const landing = toMeters({ x: t.landingX, y: t.landingY }, goalAreaDepth, maten)
    const player =
      typeof t.player === 'object' && t.player !== null
        ? (t.player as { shirtNumber?: number | null })
        : null
    return {
      half,
      gameClock,
      video_time_s: offset == null ? null : offset + gameClock,
      event_type: t.outcome === 'goal' || t.outcome === 'own_goal' ? 'doelpunt' : 'worp',
      worp_type: t.type === 'rug' ? 'rugworp' : 'nekworp',
      outcome: t.outcome,
      landing: { x_norm: t.landingX, y_norm: t.landingY, x_m: landing.x, y_m: landing.y },
      speler: {
        team: String(relId(t.team)) === String(homeTeamId) ? 'home' : 'away',
        rugnummer: player?.shirtNumber ?? null,
      },
    }
  })

  const syncbaar = labels.filter((l) => l.video_time_s != null).length
  return Response.json({
    match: {
      id: match.id,
      videoUrl: match.videoUrl ?? null,
      videoOffsetH1,
      videoOffsetH2,
      goalAreaDepth,
      veldBreedteM: match.veldBreedte ?? null,
      veldSpeelveldM: match.veldSpeelveld ?? null,
      ploegen: { home: teamNaam(match.homeTeam), away: teamNaam(match.awayTeam) },
    },
    labels,
    rapport: { totaal: labels.length, syncbaar, nietSyncbaar: labels.length - syncbaar },
  })
}
