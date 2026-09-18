import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { hoofdAantekenaar, sanitizeAantekenaars, sanitizeAfsluiter } from '@/lib/aantekenaars'
import { getAuthUser } from '@/lib/auth-user'
import { hasFunctionGrant } from '@/lib/function-grants'
import { getPayloadClient } from '@/lib/payload-client'
import { AantekenaarsOverzicht, type Regel, type PersoonTotaal } from './AantekenaarsOverzicht'
import './aantekenaars.css'

export const dynamic = 'force-dynamic'

// Hoeveel wedstrijden we ophalen. Een tornooidag telt er tientallen; een seizoen loopt in de
// honderden. Meer dan dit is geen overzicht meer, en de lijst zegt het zelf als ze afgekapt is.
const MAX = 500

/**
 * Federatie/admin: wie tekende welke tornooiwedstrijd aan?
 *
 * Bij een betwiste uitslag is de eerste vraag altijd dezelfde — wie heeft dit ingevuld. Die vraag
 * was tot nu onbeantwoordbaar: de tornooi-actieroute schreef niets weg over de invoerder. Sinds het
 * auditspoor (src/lib/aantekenaars.ts) staat het per wedstrijd vast, en dit scherm bundelt het.
 *
 * Enkel federatieniveau: de wedstrijdkaart toont publiek wie aantekende, maar het KRUISVERBAND
 * — wie doet er veel, wie tekende die ene betwiste wedstrijd aan — is beheerwerk.
 */
export default async function AantekenaarsPage() {
  const me = await getAuthUser()
  const payload = await getPayloadClient()
  const granted = await hasFunctionGrant(payload, (me as { id?: number } | null)?.id, 'beheer/aantekenaars')
  if (!isFederationLevel(me) && !granted) {
    return (
      <>
        <SiteHeader active="federatie" />
        <div className="site">
          <h1 className="page-title"><span className="brand">Aantekenaars</span></h1>
          <p className="empty">
            Enkel de federatie/admin kan zien wie welke wedstrijd aantekende.{' '}
            <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
          </p>
        </div>
      </>
    )
  }

  const res = await payload
    .find({
      collection: 'tournament-matches',
      sort: '-updatedAt',
      depth: 0,
      limit: MAX,
      overrideAccess: true,
    })
    .catch(() => ({ docs: [] as Record<string, unknown>[], totalDocs: 0 }))

  // Tornooinamen erbij: een wedstrijdlabel als "Ronde 1 · wedstrijd 3" zegt op zich niets.
  const tornooiIds = [
    ...new Set(
      res.docs
        .map((d) => {
          const t = (d as { tournament?: unknown }).tournament
          return typeof t === 'object' && t ? Number((t as { id?: unknown }).id) : Number(t)
        })
        .filter((n) => Number.isFinite(n)),
    ),
  ]
  const tornooien = tornooiIds.length
    ? await payload
        .find({ collection: 'tournaments', where: { id: { in: tornooiIds } }, depth: 0, limit: 500, overrideAccess: true })
        .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    : { docs: [] as Record<string, unknown>[] }
  const naamVanTornooi = new Map<number, string>()
  for (const t of tornooien.docs) {
    naamVanTornooi.set(Number((t as { id: number }).id), String((t as { name?: unknown }).name ?? 'Tornooi'))
  }

  const regels: Regel[] = []
  const totalen = new Map<number, PersoonTotaal>()
  for (const d of res.docs) {
    const lijst = sanitizeAantekenaars((d as { aantekenaars?: unknown }).aantekenaars)
    if (lijst.length === 0) continue // niets ingevuld, of van vóór dit spoor bestond
    const afsluiter = sanitizeAfsluiter((d as { afgeslotenDoor?: unknown }).afgeslotenDoor)
    const hoofd = hoofdAantekenaar(lijst)
    const tRaw = (d as { tournament?: unknown }).tournament
    const tId = typeof tRaw === 'object' && tRaw ? Number((tRaw as { id?: unknown }).id) : Number(tRaw)
    regels.push({
      matchId: Number((d as { id: number }).id),
      tornooiId: Number.isFinite(tId) ? tId : null,
      tornooi: naamVanTornooi.get(tId) ?? 'Onbekend tornooi',
      label: String((d as { label?: unknown }).label ?? '—'),
      home: String((d as { home?: unknown }).home ?? '') || null,
      away: String((d as { away?: unknown }).away ?? '') || null,
      status: String((d as { status?: unknown }).status ?? 'pending'),
      hoofd: hoofd ? { naam: hoofd.naam, rol: hoofd.rol, acties: hoofd.acties } : null,
      medewerkers: lijst.filter((a) => a.id !== hoofd?.id).map((a) => a.naam),
      afsluiter: afsluiter ? afsluiter.naam : null,
      laatste: lijst.reduce((m, a) => Math.max(m, a.laatste), 0),
    })

    // Per persoon optellen: hoeveel wedstrijden raakte hij aan, hoeveel sloot hij af.
    for (const a of lijst) {
      // De lijst staat op -updatedAt, dus de EERSTE keer dat we iemand tegenkomen is zijn meest
      // recente wedstrijd. Die naam houden we; overschrijven zou telkens een oudere naam zetten.
      const t = totalen.get(a.id) ?? { id: a.id, naam: a.naam, rol: a.rol, wedstrijden: 0, afgesloten: 0, acties: 0 }
      t.wedstrijden += 1
      t.acties += a.acties
      if (afsluiter && afsluiter.id === a.id) t.afgesloten += 1
      totalen.set(a.id, t)
    }
  }

  const personen = [...totalen.values()].sort(
    (a, b) => b.wedstrijden - a.wedstrijden || a.naam.localeCompare(b.naam, 'nl'),
  )

  return (
    <>
      <SiteHeader active="federatie" />
      <div className="site">
        <h1 className="page-title">
          <span className="brand">Aantekenaars</span> — tornooiwedstrijden
        </h1>
        <p className="page-sub">
          Wie voerde welke tornooiwedstrijd in. Het spoor wordt automatisch bijgehouden bij elke
          aantekenactie; wedstrijden van vóór die invoering staan er niet bij.
        </p>
        <AantekenaarsOverzicht
          regels={regels}
          personen={personen}
          afgekapt={Number((res as { totalDocs?: number }).totalDocs ?? 0) > MAX}
          max={MAX}
        />
      </div>
    </>
  )
}
