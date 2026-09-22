import { cookies } from 'next/headers'

import { SiteHeader } from '@/components/SiteHeader'
import { userClubId, userTeamId, userTeamIds } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { dateStrBE } from '@/lib/datetime'
import { LIVE_VIEW_COOKIE, type LiveView } from '@/lib/live-view'
import { getPayloadClient } from '@/lib/payload-client'
import { isSupportersMode } from '@/lib/score-mode'
import { LiveBoard } from './LiveBoard'
import { loadLiveDay, loadLiveWeekend, loadSpeeldagen, resolveDefaultDay, weekendZaterdag } from './loadLiveDay'
import { TournamentLiveStrip } from './TournamentLiveStrip'
import './live.css'

export const dynamic = 'force-dynamic'

export default async function LivePage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string }> }) {
  const { date, view: viewParam } = await searchParams
  const today = dateStrBE()
  const savedView = (await cookies()).get(LIVE_VIEW_COOKIE)?.value === 'weekend' ? 'weekend' : 'dag'
  const view: LiveView = viewParam === 'dag' || viewParam === 'weekend' ? viewParam : savedView
  // Zelfde gedrag als de startpagina: zonder expliciete datum meteen naar de eerstvolgende
  // speeldag springen i.p.v. een blanco "vandaag" te tonen.
  const gekozenDag = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : await resolveDefaultDay(today)
  const selected = view === 'weekend' ? weekendZaterdag(gekozenDag) : gekozenDag

  const user = await getAuthUser()
  const cid = userClubId(user)
  const myClubId = cid != null && Number.isFinite(Number(cid)) ? Number(cid) : null
  const tid = userTeamId(user)
  const myTeamId = tid != null && Number.isFinite(Number(tid)) ? Number(tid) : null
  const myTeamIds = userTeamIds(user)

  const days = view === 'weekend' ? await loadLiveWeekend(selected, today) : await loadLiveDay(selected, today)
  // Alle dagen mét wedstrijden, zodat de pijltjes de lege dagen overslaan en de kiezer per dag
  // toont hoeveel er gepland staat.
  const speeldagen = await loadSpeeldagen()
  const supportersMode = await isSupportersMode(await getPayloadClient())

  return (
    <>
      <SiteHeader active="wedstrijden" />
      <div className="lb-page">
        <TournamentLiveStrip />
        <LiveBoard date={selected} today={today} matches={days} speeldagen={speeldagen} view={view} myClubId={myClubId} myTeamId={myTeamId} myTeamIds={myTeamIds} supportersMode={supportersMode} userId={user?.id ?? null} />
      </div>
    </>
  )
}
