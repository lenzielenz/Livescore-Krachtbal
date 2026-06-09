import { SiteHeader } from '@/components/SiteHeader'
import { userClubId } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { dateStrBE } from '@/lib/datetime'
import { LiveBoard } from './LiveBoard'
import { loadLiveDay } from './loadLiveDay'
import './live.css'

export const dynamic = 'force-dynamic'

export default async function LivePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams
  const today = dateStrBE()
  const selected = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today

  const user = await getAuthUser()
  const cid = userClubId(user)
  const myClubId = cid != null && Number.isFinite(Number(cid)) ? Number(cid) : null

  const days = await loadLiveDay(selected, today)

  return (
    <>
      <SiteHeader active="wedstrijden" />
      <div className="lb-page">
        <LiveBoard date={selected} today={today} matches={days} myClubId={myClubId} />
      </div>
    </>
  )
}
