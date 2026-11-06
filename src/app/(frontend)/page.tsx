import { cookies } from 'next/headers'
import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { userClubId, userTeamId, userTeamIds } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { aantekenRolVan } from '@/lib/wedstrijddag-acties'
import { dateStrBE } from '@/lib/datetime'
import { LIVE_VIEW_COOKIE, type LiveView } from '@/lib/live-view'
import { getPayloadClient } from '@/lib/payload-client'
import { isSupportersMode } from '@/lib/score-mode'
import { TornooiTeaser } from '@/components/TornooiTeaser'
import { LiveBoard } from './live/LiveBoard'
import { loadLiveDay, loadLiveWeekend, loadSpeeldagen, resolveDefaultDay, weekendZaterdag } from './live/loadLiveDay'
import './live/live.css'

export const dynamic = 'force-dynamic'

// Profiel 1 — supporters — komt op de startpagina en volgt enkel de wedstrijden.
// De tools voor de andere profielen leven in het "Meer"-menu, niet hier.
export default async function HomePage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string }> }) {
  const { date, view: viewParam } = await searchParams
  const today = dateStrBE()
  // Zonder expliciete ?view= valt terug op de bewaarde voorkeur (zie de "Bewaar als
  // standaard"-knop in LiveBoard) — zo onthoudt elke gebruiker zijn eigen dag/weekend-keuze.
  const savedView = (await cookies()).get(LIVE_VIEW_COOKIE)?.value === 'weekend' ? 'weekend' : 'dag'
  const view: LiveView = viewParam === 'dag' || viewParam === 'weekend' ? viewParam : savedView
  // Geen expliciete datum in de URL? Dan nooit blanco openen: spring naar de eerstvolgende dag
  // mét een wedstrijd (bv. in augustus, vóór de seizoensstart in september) i.p.v. "vandaag" te
  // tonen met niets erop. Staat er wél al iets vandaag (of bezig), dan blijft dat "vandaag".
  const gekozenDag = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : await resolveDefaultDay(today)
  const selected = view === 'weekend' ? weekendZaterdag(gekozenDag) : gekozenDag

  const days = view === 'weekend' ? await loadLiveWeekend(selected, today) : await loadLiveDay(selected, today)
  // Alle dagen mét wedstrijden, zodat de pijltjes de lege dagen overslaan en de kiezer per dag
  // toont hoeveel er gepland staat.
  const speeldagen = await loadSpeeldagen()
  // Onder de titel enkel iets concreets: hoeveel wedstrijden er nu live zijn. Geen vaste
  // oneliner meer — die stond er elke dag en zei niets over vandaag.
  const nuLive = days.filter((m) => m.status === 'live').length
  const me = await getAuthUser()
  const cid = userClubId(me)
  const myClubId = cid != null && Number.isFinite(Number(cid)) ? Number(cid) : null
  const tid = userTeamId(me)
  const myTeamId = tid != null && Number.isFinite(Number(tid)) ? Number(tid) : null
  const myTeamIds = userTeamIds(me)
  const supportersMode = await isSupportersMode(await getPayloadClient())

  return (
    <>
      <SiteHeader active="wedstrijden" />
      <div className="lb-page">
        {/* Titel + quote zijn oriëntatie voor nieuwkomers (de merknaam staat al vast in de
            SiteHeader erboven) — ingelogd ken je de site al, dan mag dit plaatsmaken voor de
            wedstrijden zelf. */}
        {!me && (
          <>
            <div className="home-intro">
              <h1>
                <span className="brand">Krachtbal</span> Live
              </h1>
              {/* Altijd zichtbare oriëntatie voor nieuwkomers — i.p.v. verstopt onder "Meer".
                  Zo weet elke bezoeker meteen waar hij uitleg over het platform vindt. */}
              <Link href="/uitleg" className="home-intro-link">
                ❓ Zo werkt het
              </Link>
            </div>
            {nuLive > 0 && (
              <p className="home-live">
                <span className="home-live-dot" aria-hidden /> {nuLive} {nuLive === 1 ? 'wedstrijd' : 'wedstrijden'} nu live
              </p>
            )}
          </>
        )}

        {/* Registreer-uitnodiging (enkel uitgelogd): één smalle balk, zodat de wedstrijden hoog
            blijven beginnen. Kijken kan zonder account; inloggen zit in het menu. */}
        {!me && (
          <Link href="/registreren" className="home-cta-balk">
            <span>
              <b>Gratis account:</b> volg, voorspel, verdien badges
            </span>
            <span aria-hidden className="home-cta-pijl">→</span>
          </Link>
        )}

        {/* Geen tornooi-wedstrijden op de homepage — wél de snellink met aftelklok naar de
            tornooidag, zodat nieuwe mensen meteen hun weg vinden. */}
        <TornooiTeaser />
        <LiveBoard date={selected} today={today} matches={days} speeldagen={speeldagen} view={view} myClubId={myClubId} myTeamId={myTeamId} supportersMode={supportersMode} userId={me?.id ?? null} aantekenRol={aantekenRolVan((me as { roles?: string[] } | null)?.roles)} />
      </div>
    </>
  )
}
