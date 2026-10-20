import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { competitionWhere } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { hasFunctionGrant } from '@/lib/function-grants'
import { getPayloadClient } from '@/lib/payload-client'
import { LedenManager, type Lid } from './LedenManager'
import { RegistratieWachtrij, type Aanvraag } from './RegistratieWachtrij'
import '../../club/leden/club-leden.css'
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

  // Wachtrij: wat clubs ingediend hebben, oudste eerst (wie eerst indient, wordt eerst bekeken).
  const dag = (v: unknown) => (v ? new Date(String(v)).toISOString().slice(0, 10) : '')
  const ingediend = await payload
    .find({
      collection: 'players',
      where: { registratieStatus: { equals: 'ingediend' } },
      sort: 'ingediendOp',
      depth: 2,
      limit: 1000,
      pagination: false,
      overrideAccess: true,
    })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const aanvragen: Aanvraag[] = ingediend.docs.map((p) => {
    const r = p as Record<string, unknown>
    const team = rel(r.team)
    const club = team.id != null ? rel((r.team as { club?: unknown } | undefined)?.club) : { id: null, name: '—' }
    const attest = r.medischAttestBestand && typeof r.medischAttestBestand === 'object' ? (r.medischAttestBestand as { filename?: unknown }) : null
    return {
      id: Number(r.id),
      naam: String(r.name ?? '—'),
      clubNaam: club.name,
      teamNaam: team.name,
      birthDate: dag(r.birthDate),
      geslacht: String(r.geslacht ?? ''),
      soortLid: String(r.soortLid ?? 'speler'),
      medischeKeuringOp: dag(r.medischeKeuringOp),
      attestUrl: attest?.filename ? `/api/medische-attesten/file/${encodeURIComponent(String(attest.filename))}` : null,
      ingediendOp: dag(r.ingediendOp),
      vergunningsnummer: String(r.vergunningsnummer ?? ''),
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
        <RegistratieWachtrij aanvragen={aanvragen} />
        <LedenManager leden={leden} />
      </div>
    </>
  )
}
