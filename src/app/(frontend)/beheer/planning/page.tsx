import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { competitionWhere } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { hasFunctionGrant } from '@/lib/function-grants'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'
import { ClubKleurenImport } from './ClubKleurenImport'
import { Ontdubbelen } from './Ontdubbelen'
import { PlanningImport, type PlanningTeam } from './PlanningImport'

export const dynamic = 'force-dynamic'

// Federatie, of een expliciete toekenning voor 'beheer/planning' (zie lib/function-grants.ts): het
// volledige seizoensplan in één keer importeren (plak/CSV).
export default async function PlanningPage() {
  const payload = await getPayloadClient()
  const user = await getAuthUser()
  const granted = await hasFunctionGrant(payload, (user as { id?: number } | null)?.id, 'beheer/planning')
  const allowed = isFederationLevel(user) || granted

  // Alle bestaande ploegen, licht geladen — voedt de ploeg-toewijzing in PlanningImport: een
  // ploegnaam uit het bestand die niet exact matcht, kan de gebruiker daar aan een van deze
  // koppelen i.p.v. haar (per ongeluk) dubbel te laten aanmaken.
  let teams: PlanningTeam[] = []
  if (allowed) {
    const teamsRes = await payload
      .find({ collection: 'teams', where: competitionWhere(), depth: 1, limit: 8000, sort: 'name' })
      .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    teams = teamsRes.docs.map((t) => {
      const club = (t as { club?: unknown }).club
      return {
        id: (t as { id: number }).id,
        naam: String((t as { name?: unknown }).name ?? '—'),
        reeks: String((t as { reeks?: unknown }).reeks ?? ''),
        reeksNaam: reeksNaam((t as { reeks?: unknown }).reeks),
        club: club && typeof club === 'object' ? String((club as { name?: unknown }).name ?? '') : '',
      }
    })
  }

  return (
    <>
      <SiteHeader active="federatie" />
      <div className="site">
        <h1 className="page-title"><span className="brand">Seizoensplanning</span> · import</h1>
        {!allowed ? (
          <p className="empty">
            Enkel de federatie/admin kan het speelplan importeren.{' '}
            <Link href="/inloggen" className="hub-pill">Inloggen →</Link>
          </p>
        ) : (
          <>
            <PlanningImport teams={teams} />
            <Ontdubbelen />
            <ClubKleurenImport />
          </>
        )}
      </div>
    </>
  )
}
