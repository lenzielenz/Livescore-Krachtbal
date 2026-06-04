import { headers } from 'next/headers'

import { SiteHeader } from '@/components/SiteHeader'
import { hasRole, isFederationLevel, userOfficialId } from '@/lib/access'
import { getPayloadClient } from '@/lib/payload-client'
import { personalCode, personalQrValue } from '@/lib/referee-credentials'
import { RefereeLogin } from './RefereeLogin'
import { RefereePortal } from './RefereePortal'
import '../../wedstrijdblad.css'

export const dynamic = 'force-dynamic'

// Persoonlijk portaal voor de scheidsrechter: log in en toon de eigen QR-code (+ backup-code)
// waarmee een wedstrijd vrijgegeven wordt, en maak desnoods een tijdelijke 'ziek'-QR aan.
export default async function RefereePortaalPage() {
  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: await headers() }).catch(() => ({ user: null }))

  const isReferee = hasRole(user, 'scheidsrechter') || isFederationLevel(user)

  let body
  if (!user || !isReferee) {
    body = <RefereeLogin />
  } else {
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
          Scheidsrechter <span className="brand">·</span> Mijn QR
        </h1>
        {body}
      </div>
    </>
  )
}
