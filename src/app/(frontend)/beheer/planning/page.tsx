import { headers } from 'next/headers'
import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { getPayloadClient } from '@/lib/payload-client'
import { ClubKleurenImport } from './ClubKleurenImport'
import { PlanningImport } from './PlanningImport'

export const dynamic = 'force-dynamic'

// Federatie: het volledige seizoensplan in één keer importeren (plak/CSV).
export default async function PlanningPage() {
  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: await headers() }).catch(() => ({ user: null }))
  const allowed = isFederationLevel(user)

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
            <ClubKleurenImport />
          </>
        )}
      </div>
    </>
  )
}
