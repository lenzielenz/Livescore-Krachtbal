import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel, userClubId } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { CATEGORY_OPTIONS } from '@/lib/categories'
import { getPayloadClient } from '@/lib/payload-client'
import { REEKS_OPTIONS } from '@/lib/reeksen'
import { BulkPlayers } from './BulkPlayers'

export const dynamic = 'force-dynamic'

// Niveau-aanduiding voor een ploeg: de volledige reeksnaam (bv. "1NAH — 1ste Nationale
// Heren"), met de categorie als terugval. Zo zijn meerdere ploegen van dezelfde club uit
// elkaar te houden in de keuzelijst.
const niveauLabel = (reeks: unknown, category: unknown): string => {
  const r = REEKS_OPTIONS.find((o) => o.value === reeks)
  if (r) return r.label
  if (typeof reeks === 'string' && reeks) return reeks
  const c = CATEGORY_OPTIONS.find((o) => o.value === category)
  return c?.label ?? ''
}

export default async function BulkPlayersPage() {
  const me = await getAuthUser()
  const fed = isFederationLevel(me)
  const clubId = userClubId(me)

  // Een club-beheerder ziet enkel de ploegen van de eigen club; federatie/admin ziet alles.
  if (!me) {
    return (
      <>
        <SiteHeader active="clubs" />
        <div className="site">
          <h1 className="page-title">Spelers snel toevoegen</h1>
          <p className="empty">Log in om spelers toe te voegen. <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link></p>
        </div>
      </>
    )
  }
  if (!fed && clubId == null) {
    return (
      <>
        <SiteHeader active="clubs" />
        <div className="site">
          <h1 className="page-title">Spelers snel toevoegen</h1>
          <p className="empty">Je account is nog niet aan een club gekoppeld. Vraag de federatie om je gebruiker aan je club te koppelen.</p>
        </div>
      </>
    )
  }

  const payload = await getPayloadClient()
  const teamsRes = await payload.find({
    collection: 'teams',
    where: fed ? {} : { club: { equals: clubId } },
    sort: 'name',
    depth: 1,
    limit: 300,
  })

  const teams = teamsRes.docs.map((t) => {
    const club = typeof t.club === 'object' && t.club ? t.club.name : ''
    // Toon de club (en de ploegnaam als die afwijkt) plus het niveau, zodat ploegen van
    // dezelfde club niet als identieke regels verschijnen.
    const base = club && club !== t.name ? `${club} — ${t.name}` : t.name || club
    const niveau = niveauLabel(t.reeks, t.category)
    return { id: t.id, label: niveau ? `${base} · ${niveau}` : base }
  })

  return (
    <>
      <SiteHeader active="clubs" />
      <div className="site">
      <h1 className="page-title">Spelers snel toevoegen</h1>
      {teams.length === 0 ? (
        <p className="empty">Nog geen ploegen voor jouw club. Vraag de federatie om je ploegen aan te maken.</p>
      ) : (
        <BulkPlayers teams={teams} />
      )}
      </div>
    </>
  )
}
