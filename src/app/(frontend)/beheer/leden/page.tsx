import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { competitionWhere } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { hasFunctionGrant } from '@/lib/function-grants'
import { getPayloadClient } from '@/lib/payload-client'
import { LedenManager, type Lid } from './LedenManager'
import './leden.css'

export const dynamic = 'force-dynamic'

const rel = (v: unknown): { id: number | null; name: string } => {
  if (v && typeof v === 'object') return { id: (v as { id?: number }).id ?? null, name: String((v as { name?: unknown }).name ?? '—') }
  return { id: typeof v === 'number' ? v : null, name: '—' }
}

// Federatie/admin, of een expliciete toekenning voor 'beheer/leden' (zie lib/function-grants.ts):
// ledenlijst met de medische keuring + vergunning (paspoort). Markeer wie medisch gekeurd is en mag
// spelen; dat werkt meteen door in de opstelling en bij de scheidsrechter.
export default async function LedenPage() {
  const me = await getAuthUser()
  const payload = await getPayloadClient()
  const granted = await hasFunctionGrant(payload, (me as { id?: number } | null)?.id, 'beheer/leden')
  if (!isFederationLevel(me) && !granted) {
    return (
      <>
        <SiteHeader active="federatie" />
        <div className="site">
          <h1 className="page-title"><span className="brand">Ledenkeuring</span></h1>
          <p className="empty">
            Enkel de federatie/admin kan de medische keuring beheren.{' '}
            <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
          </p>
        </div>
      </>
    )
  }

  const playersRes = await payload
    .find({ collection: 'players', where: competitionWhere(), sort: 'name', depth: 2, limit: 5000, pagination: false, overrideAccess: true })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))

  const leden: Lid[] = playersRes.docs.map((p) => {
    const team = rel((p as { team?: unknown }).team)
    const club = team.id != null ? rel(((p as { team?: { club?: unknown } }).team)?.club) : { id: null, name: '—' }
    return {
      id: (p as { id: number }).id,
      name: String((p as { name?: unknown }).name ?? '—'),
      shirtNumber: Number((p as { shirtNumber?: unknown }).shirtNumber ?? 0),
      teamName: team.name,
      clubName: club.name,
      vergunningsstatus: String((p as { vergunningsstatus?: unknown }).vergunningsstatus ?? 'geen'),
      medischAttest: Boolean((p as { medischAttest?: unknown }).medischAttest),
      hogerSpelenVerbod: Boolean((p as { hogerSpelenVerbod?: unknown }).hogerSpelenVerbod),
    }
  })

  return (
    <>
      <SiteHeader active="federatie" />
      <div className="site">
        <h1 className="page-title"><span className="brand">Ledenkeuring</span></h1>
        <p className="acc-page-intro">
          Alle leden met hun <strong>vergunning (paspoort)</strong> en <strong>medische keuring</strong>. Duid aan wie
          medisch gekeurd is en mag spelen — een groene bol = speelgerechtigd. Dit werkt meteen door in de opstelling
          en bij de scheidsrechter: enkel gekeurde, vergunde leden kunnen opgesteld worden.
        </p>
        <LedenManager leden={leden} />
      </div>
    </>
  )
}
