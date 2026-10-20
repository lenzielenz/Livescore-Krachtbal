import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { dateStrBE, formatDateTimeBE } from '@/lib/datetime'
import { relId } from '@/lib/federatie-api'
import { getPayloadClient } from '@/lib/payload-client'
import { FederatieAlleen } from '../FederatieAlleen'
import { Toewijzen, type ToewijsWedstrijd } from './Toewijzen'
import '../federatie-tools.css'

export const dynamic = 'force-dynamic'

const DAGEN = 35

// Scheidsrechters toewijzen voor de komende weken, per speeldag. Conflicten (dubbel geboekt,
// fluiten bij de eigen club) springen in het oog; "Vul automatisch" stelt de lege plaatsen voor.
export default async function ScheidsrechtersPage() {
  const me = await getAuthUser()
  if (!isFederationLevel(me)) return <FederatieAlleen titel="Scheidsrechters toewijzen" />

  const payload = await getPayloadClient()
  const nu = Date.now()
  const [matches, officials] = await Promise.all([
    payload.find({
      collection: 'matches',
      where: {
        and: [
          { analyseOnly: { not_equals: true } },
          { isDemo: { not_equals: true } },
          { status: { equals: 'scheduled' } },
          { date: { greater_than_equal: new Date(nu - 6 * 3600_000).toISOString() } },
          { date: { less_than: new Date(nu + DAGEN * 86_400_000).toISOString() } },
        ],
      },
      sort: 'date',
      depth: 1,
      limit: 1000,
      pagination: false,
      overrideAccess: true,
    }),
    payload.find({ collection: 'officials', where: { type: { equals: 'scheidsrechter' } }, sort: 'name', depth: 1, limit: 500, pagination: false, overrideAccess: true }),
  ])
  const ids = matches.docs.map((m) => Number(m.id))
  const sheets = ids.length
    ? await payload.find({ collection: 'matchsheets', where: { match: { in: ids } }, depth: 0, limit: ids.length, pagination: false, overrideAccess: true })
    : { docs: [] }
  const refVan = new Map(sheets.docs.map((s) => [relId(s.match), relId(s.assignedReferee)]))

  const team = (v: unknown) => (v && typeof v === 'object' ? (v as { name?: unknown; club?: unknown }) : null)
  const wedstrijden: ToewijsWedstrijd[] = matches.docs.map((m) => {
    const thuis = team(m.homeTeam)
    const uit = team(m.awayTeam)
    return {
      matchId: Number(m.id),
      dag: dateStrBE(new Date(String(m.date))),
      aftrap: new Date(String(m.date)).getTime(),
      tijd: formatDateTimeBE(String(m.date)),
      titel: `${String(thuis?.name ?? '?')} – ${String(uit?.name ?? '?')}`,
      reeks: String(m.reeks ?? ''),
      clubs: [relId(thuis?.club), relId(uit?.club)],
      scheidsrechter: refVan.get(Number(m.id)) ?? null,
    }
  })
  const refs = officials.docs.map((o) => {
    const user = o.user && typeof o.user === 'object' ? (o.user as { club?: unknown }) : null
    return { id: Number(o.id), naam: String(o.name ?? ''), club: relId(user?.club) }
  })

  return (
    <>
      <SiteHeader active="federatie" />
      <div className="site">
        <h1 className="page-title">Scheidsrechters toewijzen</h1>
        <p className="acc-page-intro">
          De komende {DAGEN} dagen, per speeldag. Kies per wedstrijd een scheidsrechter of laat het voorstel de lege plaatsen
          invullen; bewaren stuurt elke scheidsrechter een melding. Een nieuwe scheidsrechter voeg je toe in{' '}
          <Link href="/admin/collections/officials/create" style={{ color: 'var(--accent)' }}>het beheer</Link>.
        </p>
        {refs.length === 0 ? (
          <p className="empty">Nog geen scheidsrechters in het systeem.</p>
        ) : wedstrijden.length === 0 ? (
          <p className="empty">Geen geplande wedstrijden in deze periode.</p>
        ) : (
          <Toewijzen wedstrijden={wedstrijden} refs={refs} />
        )}
      </div>
    </>
  )
}
