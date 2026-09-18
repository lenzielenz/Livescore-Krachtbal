import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { hasFunctionGrant } from '@/lib/function-grants'
import { getPayloadClient } from '@/lib/payload-client'
import { ClubKleurenImport } from './ClubKleurenImport'
import { Ontdubbelen } from './Ontdubbelen'
import { PlanningImport } from './PlanningImport'

export const dynamic = 'force-dynamic'

// Federatie, of een expliciete toekenning voor 'beheer/planning' (zie lib/function-grants.ts): het
// volledige seizoensplan in één keer importeren (plak/CSV).
export default async function PlanningPage() {
  const payload = await getPayloadClient()
  const user = await getAuthUser()
  const granted = await hasFunctionGrant(payload, (user as { id?: number } | null)?.id, 'beheer/planning')
  const allowed = isFederationLevel(user) || granted

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
            <PlanningImport />
            <Ontdubbelen />
            <ClubKleurenImport />
          </>
        )}
      </div>
    </>
  )
}
