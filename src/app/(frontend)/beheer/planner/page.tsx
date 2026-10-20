import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { dateStrBE, zaterdagVan } from '@/lib/datetime'
import { laatsteRonde } from '@/lib/inschrijving'
import { relId } from '@/lib/meldingen'
import { getPayloadClient } from '@/lib/payload-client'
import { verplaatsingen } from '@/lib/verplaatsing'
import { FederatieAlleen } from '../FederatieAlleen'
import { Planner, type PlannerWedstrijd } from './Planner'
import '../federatie-tools.css'
import './planner.css'

export const dynamic = 'force-dynamic'

// De visuele planner: alle geplande wedstrijden per speelweekend, verplaatsen door te slepen (of aan te
// tikken), met wat er botst meteen zichtbaar. Opslaan gaat via /api/federatie/verplaatsen (iedereen
// verwittigd). Ernaast de verplaatsingsaanvragen van de clubs.
export default async function PlannerPage() {
  const me = await getAuthUser()
  if (!isFederationLevel(me)) return <FederatieAlleen titel="Planner" />
  const payload = await getPayloadClient()
  const vandaag = new Date(Date.now() - 86_400_000).toISOString()
  const res = await payload.find({
    collection: 'matches',
    where: { and: [{ status: { equals: 'scheduled' } }, { date: { greater_than: vandaag } }, { isDemo: { not_equals: true } }, { analyseOnly: { not_equals: true } }] },
    sort: 'date',
    depth: 1,
    limit: 3000,
    pagination: false,
    overrideAccess: true,
  })
  const ploeg = (t: unknown) => {
    const o = t && typeof t === 'object' ? (t as { id?: number; name?: string; club?: unknown; koppelMet?: unknown }) : null
    const club = o?.club && typeof o.club === 'object' ? (o.club as { id?: number; name?: string }) : null
    return { id: Number(o?.id ?? 0), naam: String(o?.name ?? '?'), club: relId(o?.club) ?? 0, clubNaam: String(club?.name ?? '') }
  }
  const wedstrijden: PlannerWedstrijd[] = res.docs.map((m) => ({
    id: Number(m.id),
    reeks: String(m.reeks ?? ''),
    datum: String(m.date),
    afgelast: Boolean(m.afgelast),
    thuis: ploeg(m.homeTeam),
    uit: ploeg(m.awayTeam),
  }))
  // Clubnamen ontbreken op depth 1 (club is dan een id): apart ophalen.
  const clubs = await payload.find({ collection: 'clubs', depth: 0, limit: 1000, pagination: false, overrideAccess: true })
  const clubNaam = Object.fromEntries(clubs.docs.map((c) => [Number(c.id), String(c.name)]))
  for (const w of wedstrijden) {
    w.thuis.clubNaam ||= clubNaam[w.thuis.club] ?? ''
    w.uit.clubNaam ||= clubNaam[w.uit.club] ?? ''
  }

  // Terrein niet vrij (uit de inschrijvingen van de jongste ronde) en de weekends van die ronde.
  const ronde = await laatsteRonde(payload)
  const onbeschikbaar: { club: number; weekend: string; hard: boolean; reden: string | null }[] = []
  if (ronde) {
    const ins = await payload.find({ collection: 'inschrijvingen', where: { ronde: { equals: ronde.id } }, depth: 0, limit: 500, overrideAccess: true })
    for (const d of ins.docs) {
      for (const o of (d.onbeschikbaar as { weekend?: string; hard?: boolean; reden?: string | null }[] | undefined) ?? []) {
        if (o.weekend) onbeschikbaar.push({ club: relId(d.club)!, weekend: zaterdagVan(dateStrBE(new Date(o.weekend))), hard: o.hard !== false, reden: o.reden ?? null })
      }
    }
  }
  const vrijeWeekends = (ronde?.vrijeWeekends ?? []).map((v) => ({ weekend: zaterdagVan(v.weekend), reden: v.reden ?? null }))
  const aanvragen = await verplaatsingen(payload, { status: { in: ['wacht_federatie', 'wacht_tegenpartij'] } })

  return (
    <>
      <SiteHeader active="federatie" />
      <div className="site site-breed">
        <h1 className="page-title">🗓️ Planner</h1>
        <Planner wedstrijden={wedstrijden} onbeschikbaar={onbeschikbaar} vrijeWeekends={vrijeWeekends} aanvragen={aanvragen} />
      </div>
    </>
  )
}
