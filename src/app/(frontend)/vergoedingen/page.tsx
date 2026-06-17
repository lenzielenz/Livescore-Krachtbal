import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { hasRole, isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { KwitantieForm } from './KwitantieForm'
import '../wedstrijdblad.css'

export const dynamic = 'force-dynamic'

// Scheidsrechter/federatie-only: vergoedingen bundelen officials-gegevens, geen publieke info.
export default async function VergoedingenPage() {
  const me = await getAuthUser()
  if (!hasRole(me, 'scheidsrechter') && !isFederationLevel(me)) {
    return (
      <>
        <SiteHeader active="scheidsrechters" />
        <div className="site">
          <h1 className="page-title">Scheidsrechtersvergoedingen</h1>
          <p className="wb-intro">
            Enkel scheidsrechters en de federatie/admin kunnen de vergoedingen opmaken.{' '}
            <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
          </p>
        </div>
      </>
    )
  }
  const payload = await getPayloadClient()
  const officials = await payload
    .find({ collection: 'officials', where: { type: { equals: 'scheidsrechter' } }, limit: 200, depth: 0 })
    .catch(() => ({ docs: [] as { id: number; name: string }[] }))

  const list = officials.docs.map((o) => ({ id: o.id as number, name: o.name as string }))

  return (
    <>
      <SiteHeader active="scheidsrechters" />
      <div className="site">
      <h1 className="page-title">Scheidsrechtersvergoedingen</h1>
      <p className="wb-intro">
        De kwitantie bundelt alle wedstrijden van een scheidsrechter in de gekozen periode. Het
        forfait-onkostenblad (per wedstrijd) genereer je vanaf het scheidsrechterscherm van die wedstrijd.
      </p>
      <KwitantieForm officials={list} />
      </div>
    </>
  )
}
