import { headers } from 'next/headers'

import { ProfileTools } from '@/components/ProfileTools'
import { SiteHeader } from '@/components/SiteHeader'
import { hasRole, isFederationLevel, userOfficialId } from '@/lib/access'
import { getPayloadClient } from '@/lib/payload-client'
import { getProfile } from '@/lib/profiles'
import { reeksNaam } from '@/lib/reeksen'
import { personalCode, personalQrValue } from '@/lib/referee-credentials'
import { RefereeLogin } from './RefereeLogin'
import { RefereeMatches, type RefMatch, type RefOfficial } from './RefereeMatches'
import { RefereePortal } from './RefereePortal'
import './referee-matches.css'
import '../../wedstrijdblad.css'

export const dynamic = 'force-dynamic'

const relId = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null
const teamName = (t: unknown): string => (t && typeof t === 'object' ? String((t as { name?: unknown }).name ?? '—') : '—')
// Clubnaam van een ploeg (club is op depth 2 mee gepopuleerd) — voor het club-filter in de lijst.
const clubName = (t: unknown): string | null => {
  const club = t && typeof t === 'object' ? (t as { club?: unknown }).club : null
  const name = club && typeof club === 'object' ? (club as { name?: unknown }).name : null
  return typeof name === 'string' && name ? name : null
}

// Haalt de wedstrijdenlijst + scheidsrechter-toewijzingen op voor het portaal.
async function loadRefereeMatches(): Promise<{ matches: RefMatch[]; officials: RefOfficial[] }> {
  const payload = await getPayloadClient()
  const since = new Date(Date.now() - 2 * 864e5).toISOString()
  const matchesRes = await payload
    .find({ collection: 'matches', where: { and: [{ date: { greater_than: since } }, { analyseOnly: { not_equals: true } }] }, sort: 'date', depth: 2, limit: 150 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const docs = matchesRes.docs.filter((m) => !(m as { isDemo?: boolean }).isDemo)
  const ids = docs.map((m) => (m as { id: number }).id)
  const sheetsRes = ids.length
    ? await payload.find({ collection: 'matchsheets', where: { match: { in: ids } }, depth: 1, pagination: false }).catch(() => ({ docs: [] as Record<string, unknown>[] }))
    : { docs: [] as Record<string, unknown>[] }
  const refByMatch = new Map<number, { id: number | null; name: string | null }>()
  for (const s of sheetsRes.docs) {
    const mid = relId((s as { match?: unknown }).match)
    const ar = (s as { assignedReferee?: unknown }).assignedReferee
    if (mid != null) refByMatch.set(mid, { id: relId(ar), name: ar && typeof ar === 'object' ? String((ar as { name?: unknown }).name ?? '') || null : null })
  }
  const officialsRes = await payload
    .find({ collection: 'officials', where: { type: { equals: 'scheidsrechter' } }, sort: 'name', depth: 0, limit: 400 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const officials: RefOfficial[] = officialsRes.docs.map((o) => ({ id: (o as { id: number }).id, name: String((o as { name?: unknown }).name ?? '—') }))

  const matches: RefMatch[] = docs.map((m) => {
    const id = (m as { id: number }).id
    const ref = refByMatch.get(id)
    return {
      id,
      home: teamName((m as { homeTeam?: unknown }).homeTeam),
      away: teamName((m as { awayTeam?: unknown }).awayTeam),
      homeClub: clubName((m as { homeTeam?: unknown }).homeTeam),
      awayClub: clubName((m as { awayTeam?: unknown }).awayTeam),
      reeks: reeksNaam((m as { reeks?: unknown }).reeks),
      date: ((m as { date?: unknown }).date as string | null) ?? null,
      status: String((m as { status?: unknown }).status ?? 'scheduled'),
      assignedRefId: ref?.id ?? null,
      assignedRefName: ref?.name ?? null,
    }
  })
  return { matches, officials }
}

// Persoonlijk portaal voor de scheidsrechter: log in en toon de eigen QR-code (+ backup-code)
// waarmee een wedstrijd vrijgegeven wordt, en maak desnoods een tijdelijke 'ziek'-QR aan.
export default async function RefereePortaalPage() {
  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: await headers() }).catch(() => ({ user: null }))

  const isReferee = hasRole(user, 'scheidsrechter') || isFederationLevel(user)
  const loggedIn = Boolean(user && isReferee)

  let body
  let matchesBlock = null
  if (!user || !isReferee) {
    body = <RefereeLogin />
  } else {
    const { matches, officials } = await loadRefereeMatches()
    matchesBlock = (
      <RefereeMatches
        matches={matches}
        officials={officials}
        myOfficialId={userOfficialId(user) != null ? Number(userOfficialId(user)) : null}
        isFederation={isFederationLevel(user)}
      />
    )
    const officialId = userOfficialId(user)
    if (officialId == null) {
      body = (
        <p className="wb-intro">
          Je account is nog niet gekoppeld aan een scheidsrechtersdossier. Contacteer de federatie om
          je account te koppelen — daarna verschijnt hier je persoonlijke QR-code.
        </p>
      )
    } else {
      const official = await payload
        .findByID({ collection: 'officials', id: officialId, depth: 0 })
        .catch(() => null)
      const secret = process.env.PAYLOAD_SECRET || ''
      body = (
        <RefereePortal
          naam={(official?.name as string) ?? (user.name as string) ?? 'Scheidsrechter'}
          qrValue={personalQrValue(secret, officialId)}
          code={personalCode(secret, officialId)}
        />
      )
    }
  }

  return (
    <>
      <SiteHeader active="scheidsrechters" />
      <div className="site">
        <h1 className="page-title">
          {loggedIn ? (
            <>Scheidsrechter <span className="brand">·</span> Mijn QR</>
          ) : (
            <span className="brand">Scheidsrechter</span>
          )}
        </h1>
        {/* De extra opties (QR, vergoedingen) horen pas ná het inloggen. */}
        {loggedIn && <ProfileTools profile={getProfile('scheidsrechters')} currentHref="/scheidsrechter/portaal" />}
        {matchesBlock}
        {body}
      </div>
    </>
  )
}
