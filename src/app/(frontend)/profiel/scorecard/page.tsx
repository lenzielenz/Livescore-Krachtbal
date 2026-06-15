import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { hasRole, isFederationLevel, userClubId } from '@/lib/access'
import { competitionWhere } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { normalizeLogoFit } from '@/lib/logo-fit'
import { getPayloadClient } from '@/lib/payload-client'
import { POSITION_LABELS } from '@/lib/positions'
import { buildRadarStats } from '@/lib/radar-stats'
import {
  SCORECARD_AXES,
  radarFromSkills,
  radarFromStats,
  ratingFromFracs,
  sanitizeSkills,
} from '@/lib/scorecard'
import { Scorecard, type ScorecardAxisView } from './Scorecard'
import { ScorecardEditor } from './ScorecardEditor'
import '../../wedstrijdblad.css'
import '../profiel.css'
import './scorecard.css'

export const dynamic = 'force-dynamic'

const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? (Number((v as { id?: unknown }).id) || null) : Number(v) || null

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <div className="site">
        <h1 className="page-title"><span className="brand">Scorecard</span></h1>
        {children}
      </div>
    </>
  )
}

export default async function ScorecardPage({ searchParams }: { searchParams: Promise<{ lid?: string }> }) {
  const authUser = await getAuthUser()
  if (!authUser) {
    return (
      <Shell>
        <section className="wb-card" style={{ maxWidth: 440 }}>
          <p className="wb-sub">Log in om je scorecard te bekijken.</p>
          <Link href="/inloggen" className="wb-btn wb-btn-primary">Inloggen →</Link>
        </section>
      </Shell>
    )
  }

  const sp = await searchParams
  const myId = Number((authUser as { id: number }).id)
  const lid = sp.lid ? Number(sp.lid) : null
  const isOwn = !lid || lid === myId
  const targetId = isOwn ? myId : lid!

  const payload = await getPayloadClient()
  const target = await payload.findByID({ collection: 'users', id: targetId, depth: 1, overrideAccess: true }).catch(() => null)
  if (!target) {
    return (
      <Shell>
        <p className="wb-intro">Dit lid bestaat niet (meer).</p>
      </Shell>
    )
  }
  const t = target as unknown as Record<string, unknown>

  // Privacy: enkel jezelf, of een clubbeheerder van dezelfde club, of federatie/admin.
  if (!isOwn) {
    const targetClub = rel(t.club)
    const allowed = isFederationLevel(authUser) || (hasRole(authUser, 'club-beheerder') && userClubId(authUser) != null && userClubId(authUser) === targetClub)
    if (!allowed) {
      return (
        <Shell>
          <p className="wb-intro">Je hebt geen toegang tot de scorecard van dit lid.</p>
        </Shell>
      )
    }
  }

  // ── Databron bepalen: echte matchstatistiek wanneer er een gekoppelde speler met data is. ──
  const playerId = rel(t.player)
  let fracs: number[] = []
  let values: string[] = []
  let statsNums: { matches: number; goals: number; points: number } | null = null
  let usingStats = false

  if (playerId) {
    const player = await payload.findByID({ collection: 'players', id: playerId, depth: 1, overrideAccess: true }).catch(() => null)
    const team = player ? (player as { team?: unknown }).team : null
    const reeks = team && typeof team === 'object' ? (team as { reeks?: unknown }).reeks : null
    if (reeks) {
      const set = await buildRadarStats(payload, String(reeks), null, competitionWhere()).catch(() => [])
      const me = set.find((p) => p.playerId === playerId)
      if (me && me.matches > 0) {
        usingStats = true
        fracs = radarFromStats(me, set)
        values = SCORECARD_AXES.map((a) => a.fmt(a.get(me)))
        statsNums = { matches: me.matches, goals: me.goals, points: Math.round(me.points) }
      }
    }
  }

  const skills = sanitizeSkills(t.scorecardSkills)
  if (!usingStats) {
    fracs = radarFromSkills(skills)
    values = SCORECARD_AXES.map((a) => String(skills[a.key] ?? 0))
  }

  const rating = ratingFromFracs(fracs)
  const axes: ScorecardAxisView[] = SCORECARD_AXES.map((a, i) => ({ label: a.label, frac: fracs[i] ?? 0, value: values[i] ?? '' }))

  const photo = t.photo as { url?: string } | number | null | undefined
  const photoUrl = photo && typeof photo === 'object' ? (photo.url ?? null) : null
  const club = t.club as { name?: string } | number | null | undefined
  const clubName = club && typeof club === 'object' ? (club.name ?? null) : null
  const position = typeof t.position === 'string' ? (POSITION_LABELS[t.position] ?? null) : null
  const fit = normalizeLogoFit({ zoom: Number(t.photoZoom), offsetX: Number(t.photoOffsetX), offsetY: Number(t.photoOffsetY) })
  const name = String(t.name || t.email || 'Lid')

  // Eigen kaart → editor met de spelers van de eigen club.
  let clubPlayers: { id: number; name: string; shirtNumber: number; teamName: string }[] = []
  if (isOwn) {
    const myClub = userClubId(authUser)
    if (myClub != null) {
      const pl = await payload
        .find({
          collection: 'players',
          where: { and: [{ 'team.club': { equals: myClub } }, { analyseOnly: { not_equals: true } }] },
          depth: 1,
          limit: 500,
          overrideAccess: true,
        })
        .catch(() => ({ docs: [] as Record<string, unknown>[] }))
      clubPlayers = pl.docs
        .map((p) => ({
          id: Number((p as { id: number }).id),
          name: String((p as { name?: unknown }).name ?? '—'),
          shirtNumber: Number((p as { shirtNumber?: unknown }).shirtNumber ?? 0),
          teamName: ((): string => {
            const tm = (p as { team?: unknown }).team
            return tm && typeof tm === 'object' ? String((tm as { name?: unknown }).name ?? '—') : '—'
          })(),
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    }
  }

  return (
    <Shell>
      {isOwn ? (
        <p className="wb-intro">
          Je persoonlijke scorecard. <Link href="/profiel" style={{ color: 'var(--accent)' }}>← Naar mijn profiel</Link>
        </p>
      ) : (
        <p className="wb-intro">Scorecard van een clublid (clubbeheer).</p>
      )}

      <div className="sc-layout">
        <Scorecard
          name={name}
          clubName={clubName}
          positionLabel={position}
          photoUrl={photoUrl}
          fit={fit}
          axes={axes}
          rating={rating}
          stats={statsNums}
        />
        {isOwn && (
          <ScorecardEditor
            players={clubPlayers}
            initialPlayerId={playerId ? String(playerId) : ''}
            initialSkills={skills}
            usingStats={usingStats}
          />
        )}
      </div>
    </Shell>
  )
}
