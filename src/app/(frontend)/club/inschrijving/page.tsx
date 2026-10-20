import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { hasRole, userClubId } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { formatDateBE, formatDateTimeBE } from '@/lib/datetime'
import { inschrijvingVanClub, laatsteRonde, rondeOpen } from '@/lib/inschrijving'
import { getPayloadClient } from '@/lib/payload-client'
import { REEKS_OPTIONS } from '@/lib/reeksen'
import { InschrijvingFormulier } from './InschrijvingFormulier'
import './inschrijving.css'

export const dynamic = 'force-dynamic'

// Ploegen inschrijven voor het nieuwe seizoen, met de voorkeuren van de club (lib/inschrijving.ts).
export default async function InschrijvingPage() {
  const me = await getAuthUser()
  const clubId = userClubId(me)
  if (!(hasRole(me, 'club-beheerder', 'club-medewerker') && clubId != null)) {
    return (
      <>
        <SiteHeader active="clubs" />
        <div className="site site-breed">
          <h1 className="page-title">Inschrijving ploegen</h1>
          <p className="empty">
            Enkel de staf van een club schrijft ploegen in. {!me && <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>}
          </p>
        </div>
      </>
    )
  }
  const payload = await getPayloadClient()
  const ronde = await laatsteRonde(payload)
  if (!ronde) {
    return (
      <>
        <SiteHeader active="clubs" />
        <div className="site site-breed">
          <h1 className="page-title">Inschrijving ploegen</h1>
          <p className="empty">De federatie heeft de inschrijvingen voor het nieuwe seizoen nog niet geopend. Je krijgt een melding zodra dat gebeurt.</p>
        </div>
      </>
    )
  }
  const ins = await inschrijvingVanClub(payload, ronde.id, Number(clubId))
  const open = rondeOpen(ronde) && ins.status !== 'verwerkt'
  return (
    <>
      <SiteHeader active="clubs" />
      <div className="site site-breed">
        <h1 className="page-title">📝 Inschrijving {ronde.seizoen}</h1>
        <p className="acc-page-intro">
          {open ? (
            <>
              Schrijf jullie ploegen in vóór <strong>{formatDateTimeBE(ronde.deadline)}</strong>. Tot dan kan je alles aanpassen en opnieuw indienen.
            </>
          ) : ins.status === 'verwerkt' ? (
            <>De federatie heeft jullie inschrijving verwerkt. Een wijziging? Neem contact op met de federatie.</>
          ) : (
            <>De inschrijvingen zijn gesloten sinds {formatDateTimeBE(ronde.deadline)}.</>
          )}{' '}
          Speelweekends van {formatDateBE(ronde.eersteWeekend)} tot {formatDateBE(ronde.laatsteWeekend)}.
        </p>
        {ronde.toelichting && <p className="ins-toelichting">{ronde.toelichting}</p>}
        <InschrijvingFormulier
          ronde={ronde.id}
          status={ins.status}
          ingediendOp={ins.ingediendOp}
          open={open}
          reeksen={REEKS_OPTIONS.filter((r) => !['recreatief', 'beker', 'andere'].includes(r.value)).map((r) => ({ value: r.value, label: r.label }))}
          begin={{ ploegen: ins.ploegen, aantalVelden: ins.aantalVelden, onbeschikbaar: ins.onbeschikbaar, wensen: ins.wensen }}
          eersteWeekend={ronde.eersteWeekend}
          laatsteWeekend={ronde.laatsteWeekend}
        />
      </div>
    </>
  )
}
