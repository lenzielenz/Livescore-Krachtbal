import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { formatDateBE, formatDateTimeBE } from '@/lib/datetime'
import { inschrijvingOverzicht, laatsteRonde, rondeOpen, speelweekends } from '@/lib/inschrijving'
import { getPayloadClient } from '@/lib/payload-client'
import { FederatieAlleen } from '../FederatieAlleen'
import { InschrijvingenBeheer } from './InschrijvingenBeheer'
import { KalenderPlan } from './KalenderPlan'
import { NieuweRonde } from './NieuweRonde'
import '../federatie-tools.css'
import '../../wedstrijdblad.css'

export const dynamic = 'force-dynamic'

// Inschrijvingen voor het nieuwe seizoen (lib/inschrijving.ts) en de kalender met voorkeuren
// (lib/kalender-planner.ts): ronde openen → clubs schrijven in → verwerken → kalender maken.
export default async function InschrijvingenPage({ searchParams }: { searchParams: Promise<{ nieuw?: string }> }) {
  const me = await getAuthUser()
  if (!isFederationLevel(me)) return <FederatieAlleen titel="Inschrijvingen" />
  const payload = await getPayloadClient()
  const ronde = await laatsteRonde(payload)
  const nieuw = (await searchParams).nieuw === '1'
  if (!ronde || nieuw) {
    return (
      <>
        <SiteHeader active="federatie" />
        <div className="site site-breed">
          <h1 className="page-title">📝 Inschrijvingen</h1>
          <p className="acc-page-intro">
            Open de inschrijvingen voor een nieuw seizoen: alle clubs krijgen een melding en schrijven hun ploegen in vóór de deadline, met hun voorkeuren.
          </p>
          <NieuweRonde />
        </div>
      </>
    )
  }
  const rijen = await inschrijvingOverzicht(payload, ronde.id)
  const weekends = speelweekends(ronde)
  const teller = (s: string) => rijen.filter((r) => r.status === s).length
  return (
    <>
      <SiteHeader active="federatie" />
      <div className="site site-breed">
        <h1 className="page-title">📝 Inschrijvingen {ronde.seizoen}</h1>
        <p className="acc-page-intro">
          {rondeOpen(ronde) ? 'Open' : 'Gesloten'} · deadline {formatDateTimeBE(ronde.deadline)} · {weekends.length} speelweekends ({formatDateBE(ronde.eersteWeekend)} –{' '}
          {formatDateBE(ronde.laatsteWeekend)}
          {ronde.vrijeWeekends.length ? `, ${ronde.vrijeWeekends.length} vrij` : ''}). Ingediend {teller('ingediend')}, verwerkt {teller('verwerkt')}, concept {teller('concept')}, nog niets{' '}
          {teller('niets')}. <Link href="/beheer/inschrijvingen?nieuw=1">Nieuwe ronde →</Link>
        </p>
        <InschrijvingenBeheer ronde={{ id: ronde.id, open: rondeOpen(ronde), status: ronde.status }} rijen={rijen} />
        <h2 style={{ margin: '24px 0 8px', fontSize: '1.1rem' }}>🗓️ Kalender maken</h2>
        <KalenderPlan ronde={ronde.id} />
      </div>
    </>
  )
}
