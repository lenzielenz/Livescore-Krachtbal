import { SiteHeader } from '@/components/SiteHeader'
import { userClubId } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { dateStrBE } from '@/lib/datetime'
import { loadLiveDay, loadSpeeldagen, resolveDefaultDay } from '../../live/loadLiveDay'
import '../../live/live.css'
import './filters-demo.css'
import { FilterProposalsDemo } from './FilterProposalsDemo'

export const dynamic = 'force-dynamic'

/**
 * Testpagina — NIET gelinkt vanuit de navigatie, enkel bereikbaar via de rechtstreekse URL. Toont
 * dezelfde échte wedstrijden als de startpagina (alleen-lezen), maar met 3 alternatieve voorstellen
 * voor de selectie-/filter-UI (reeksen, ploegen, clubs, live) i.p.v. de huidige zijbalk + pillen.
 * Bedoeld om afzonderlijk te testen en te kiezen welke naar productie gaat — zie shared.tsx voor de
 * gedeelde filterlogica en elk voorstel voor de eigenlijke UI.
 */
export default async function FilterProposalsPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams
  const today = dateStrBE()
  const selected = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : await resolveDefaultDay(today)

  const matches = await loadLiveDay(selected, today)
  const speeldagen = await loadSpeeldagen()
  const me = await getAuthUser()
  const cid = userClubId(me)
  const myClubId = cid != null && Number.isFinite(Number(cid)) ? Number(cid) : null

  return (
    <>
      <SiteHeader />
      <div className="lb-page">
        <div className="fpd-intro">
          <h1><span className="brand">Testpagina</span> — selectie-UI</h1>
          <p>
            3 voorstellen om snel een ploeg, club, reeks of live wedstrijd te vinden — met de échte
            wedstrijden van vandaag. Deze pagina staat los van de echte startpagina; niets hier
            beïnvloedt wat andere bezoekers zien.
          </p>
        </div>
        <FilterProposalsDemo date={selected} today={today} matches={matches} speeldagen={speeldagen} myClubId={myClubId} userId={me?.id ?? null} />
      </div>
    </>
  )
}
