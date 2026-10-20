import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { REEKS_OPTIONS } from '@/lib/reeksen'
import { FederatieAlleen } from '../FederatieAlleen'
import { KalenderMaker } from './KalenderMaker'
import '../federatie-tools.css'

export const dynamic = 'force-dynamic'

// Kalender opmaken per reeks: heen en terug, met vrije weekends en het vaste thuisuur van elke ploeg.
// Eerst een voorstel, dan pas aanmaken.
export default async function KalenderPage() {
  const me = await getAuthUser()
  if (!isFederationLevel(me)) return <FederatieAlleen titel="Kalender opmaken" />

  const payload = await getPayloadClient()
  const teams = await payload.find({ collection: 'teams', where: { analyseOnly: { not_equals: true } }, depth: 0, limit: 3000, pagination: false, overrideAccess: true })
  const telling = new Map<string, number>()
  for (const t of teams.docs) if (t.reeks) telling.set(String(t.reeks), (telling.get(String(t.reeks)) ?? 0) + 1)
  const reeksen = REEKS_OPTIONS.filter((o) => (telling.get(o.value) ?? 0) >= 2).map((o) => ({ value: o.value, label: o.label, ploegen: telling.get(o.value) ?? 0 }))

  return (
    <>
      <SiteHeader active="federatie" />
      <div className="site site-breed">
        <h1 className="page-title">Kalender opmaken</h1>
        <p className="acc-page-intro">
          Kies een reeks en de eerste speeldag. Elke ploeg speelt één keer thuis en één keer uit tegen elke andere; thuis en uit
          wisselen eerlijk af. Een vrije datum schuift de speeldag een week op. Je ziet eerst het voorstel; wedstrijden die al
          bestaan worden niet dubbel aangemaakt.
        </p>
        {reeksen.length === 0 ? <p className="empty">Nog geen reeks met minstens twee ploegen.</p> : <KalenderMaker reeksen={reeksen} />}
      </div>
    </>
  )
}
