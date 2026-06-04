import { SiteHeader } from '@/components/SiteHeader'
import { LiveBoard } from './LiveBoard'
import { loadLiveDay } from './loadLiveDay'
import './live.css'

export const dynamic = 'force-dynamic'

export default async function LivePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams
  const today = new Date().toISOString().slice(0, 10)
  const selected = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today

  const days = await loadLiveDay(selected, today)

  return (
    <>
      <SiteHeader active="wedstrijden" />
      <div className="lb-page">
        <LiveBoard date={selected} today={today} matches={days} />
      </div>
    </>
  )
}
