import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { brusselsParts, dateStrBE, formatDateBE, formatDateTimeBE, shiftDateStr, zaterdagVan } from '@/lib/datetime'
import { getPayloadClient } from '@/lib/payload-client'
import { weekLabel } from '@/lib/weekend-verplaatsen'
import { FederatieAlleen } from '../FederatieAlleen'
import { WeekendVerplaatsen, type Speelweekend } from './WeekendVerplaatsen'
import '../federatie-tools.css'

export const dynamic = 'force-dynamic'

const DAG = 86_400_000

// Een heel speelweekend verplaatsen: kies het weekend (bv. week 43, uitgesteld door het weer) en
// het nieuwe weekend; elke wedstrijd schuift mee op haar eigen dag en uur. Vooraf zie je de lijst
// en de botsingen met wat er in het nieuwe weekend al staat.
export default async function WeekendPage() {
  const me = await getAuthUser()
  if (!isFederationLevel(me)) return <FederatieAlleen titel="Speelweekend verplaatsen" />

  const payload = await getPayloadClient()
  const nu = Date.now()
  // Van zes weken terug (een uitgesteld weekend kan al voorbij zijn) tot een seizoen vooruit.
  const matches = await payload.find({
    collection: 'matches',
    where: {
      and: [
        { analyseOnly: { not_equals: true } },
        { isDemo: { not_equals: true } },
        { status: { equals: 'scheduled' } },
        { date: { greater_than_equal: new Date(nu - 42 * DAG).toISOString() } },
        { date: { less_than: new Date(nu + 300 * DAG).toISOString() } },
      ],
    },
    sort: 'date',
    depth: 1,
    limit: 2000,
    pagination: false,
    overrideAccess: true,
  })

  const naam = (v: unknown) => (v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '?') : '?')
  const perWeekend = new Map<string, Speelweekend>()
  for (const m of matches.docs) {
    const p = brusselsParts(new Date(String(m.date)))
    const dag = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
    const zaterdag = zaterdagVan(dag)
    // Een wedstrijd op een weekdag hoort bij het weekend erna (zo rekent de kalender ook).
    let w = perWeekend.get(zaterdag)
    if (!w) {
      w = { zaterdag, label: `${weekLabel(zaterdag)} · ${formatDateBE(`${zaterdag}T12:00:00Z`, { day: 'numeric', month: 'short' })} – ${formatDateBE(`${shiftDateStr(zaterdag, 1)}T12:00:00Z`, { day: 'numeric', month: 'short', year: 'numeric' })}`, wedstrijden: [] }
      perWeekend.set(zaterdag, w)
    }
    w.wedstrijden.push({
      matchId: Number(m.id),
      titel: `${naam(m.homeTeam)} – ${naam(m.awayTeam)}`,
      reeks: String(m.reeks ?? ''),
      datumIso: String(m.date),
      tijd: formatDateTimeBE(String(m.date), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
      afgelast: m.afgelast === true,
    })
  }
  const weekends = [...perWeekend.values()].sort((a, b) => a.zaterdag.localeCompare(b.zaterdag))
  // Standaard het eerstvolgende weekend met wedstrijden, of het meest recente als er niets meer komt.
  const vandaag = dateStrBE()
  const standaard = weekends.find((w) => w.zaterdag >= zaterdagVan(vandaag))?.zaterdag ?? weekends.at(-1)?.zaterdag ?? ''

  return (
    <>
      <SiteHeader active="federatie" />
      <div className="site site-breed">
        <h1 className="page-title">Speelweekend verplaatsen</h1>
        <p className="ft-stat">
          Alle geplande wedstrijden van een speelweekend (zaterdag en zondag, plus een eventuele wedstrijd op een weekdag van die week) in één keer naar een ander weekend. Elke wedstrijd houdt haar dag en haar aftrapuur; afgelaste wedstrijden
          worden zo weer speelbaar. Beide clubs, de scheidsrechter en de spelers op de selectie krijgen per wedstrijd een melding.
        </p>
        {weekends.length === 0 ? <p className="empty">Geen geplande wedstrijden in de komende maanden.</p> : <WeekendVerplaatsen weekends={weekends} standaard={standaard} />}
      </div>
    </>
  )
}
