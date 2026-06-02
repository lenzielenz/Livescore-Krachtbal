import Link from 'next/link'

import { buildMatchState } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { REEKS_OPTIONS } from '@/lib/reeksen'
import { KantineBoard, type KantineMatch } from './KantineBoard'
import './kantine.css'

export const dynamic = 'force-dynamic'

const reeksLabel = (v: unknown) => REEKS_OPTIONS.find((o) => o.value === v)?.label ?? (typeof v === 'string' ? v : 'Overig')

function dayBounds(dateStr: string): { start: string; end: string } {
  const start = new Date(`${dateStr}T00:00:00.000`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start: start.toISOString(), end: end.toISOString() }
}

// Kantinescherm: supporters kiezen zelf welke wedstrijden ze willen volgen; de gekozen
// wedstrijden tonen als live mini-scoreborden in een raster met een doelpunt-melding per vak.
export default async function KantinePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams
  const today = new Date().toISOString().slice(0, 10)
  const selected = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today

  const payload = await getPayloadClient()
  const { start, end } = dayBounds(selected)
  const matches = await payload.find({
    collection: 'matches',
    where: { date: { greater_than_equal: start, less_than: end } },
    sort: 'date',
    depth: 0,
    limit: 200,
  })

  const list: KantineMatch[] = []
  for (const m of matches.docs) {
    try {
      const s = await buildMatchState(payload, m.id)
      list.push({
        id: m.id,
        reeks: reeksLabel(m.reeks),
        time: new Date(m.date).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' }),
        status: s.match.status,
        home: { name: s.teams.home.name, logoUrl: s.teams.home.logoUrl },
        away: { name: s.teams.away.name, logoUrl: s.teams.away.logoUrl },
        score: s.score,
      })
    } catch {
      // Wedstrijd met ontbrekende ploeg overslaan.
    }
  }

  return (
    <div className="kt-page">
      <header className="kt-top">
        <Link href="/" className="kt-home">
          <span className="brand">Krachtbal</span> Live · Kantine
        </Link>
        <Link href="/live" className="kt-toplink">Volledig overzicht</Link>
      </header>
      <KantineBoard date={selected} today={today} matches={list} />
    </div>
  )
}
