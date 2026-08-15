import { SiteHeader } from '@/components/SiteHeader'
import { userClubId } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { dateStrBE } from '@/lib/datetime'
import { getPayloadClient } from '@/lib/payload-client'
import { isSupportersMode } from '@/lib/score-mode'
import { LiveBoard } from './LiveBoard'
import { loadLiveDay, resolveDefaultDay } from './loadLiveDay'
import { TournamentLiveStrip } from './TournamentLiveStrip'
import './live.css'

export const dynamic = 'force-dynamic'

export default async function LivePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams
  const today = dateStrBE()
  // Zelfde gedrag als de startpagina: zonder expliciete datum meteen naar de eerstvolgende
  // speeldag springen i.p.v. een blanco "vandaag" te tonen.
  const selected = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : await resolveDefaultDay(today)

  const user = await getAuthUser()
  const cid = userClubId(user)
  const myClubId = cid != null && Number.isFinite(Number(cid)) ? Number(cid) : null

  const days = await loadLiveDay(selected, today)
  const supportersMode = await isSupportersMode(await getPayloadClient())

  return (
    <>
      <SiteHeader active="wedstrijden" />
      <div className="lb-page">
        <TournamentLiveStrip />
        <LiveBoard date={selected} today={today} matches={days} myClubId={myClubId} supportersMode={supportersMode} />
      </div>
    </>
  )
}
