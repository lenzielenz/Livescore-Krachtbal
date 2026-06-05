import type { Payload } from 'payload'

import { SiteHeader } from '@/components/SiteHeader'
import { buildMatchState } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { REEKS_OPTIONS } from '@/lib/reeksen'
import { KantineControl } from './KantineControl'
import { type KantineMatch } from './KantineBoard'
import './kantine.css'

export const dynamic = 'force-dynamic'

const reeksLabel = (v: unknown) => REEKS_OPTIONS.find((o) => o.value === v)?.label ?? (typeof v === 'string' ? v : 'Overig')

function todayBounds(): { start: string; end: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start: start.toISOString(), end: end.toISOString() }
}

async function currentSelection(payload: Payload): Promise<number[]> {
  const s = await payload.findGlobal({ slug: 'settings', depth: 0 }).catch(() => null)
  const raw = (s as { kantineMatchIds?: string | null } | null)?.kantineMatchIds ?? ''
  return String(raw)
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
}

// Kantine — kiespagina: bedien op je gsm/laptop welke wedstrijden op de kantine-tv verschijnen.
// Het eigenlijke scherm staat op /kantine/scherm en toont de centraal gekozen selectie.
export default async function KantinePage() {
  const payload = await getPayloadClient()
  const { start, end } = todayBounds()

  // Wedstrijden van vandaag + alle live wedstrijden (ook als hun datum afwijkt).
  const [dayRes, liveRes, selectedIds] = await Promise.all([
    payload.find({ collection: 'matches', where: { date: { greater_than_equal: start, less_than: end } }, sort: 'date', depth: 0, limit: 200 }),
    payload.find({ collection: 'matches', where: { status: { equals: 'live' } }, depth: 0, limit: 50 }),
    currentSelection(payload),
  ])

  const seen = new Set<number>()
  const docs = [...liveRes.docs, ...dayRes.docs].filter((m) => {
    if (seen.has(m.id) || (m as { isDemo?: boolean }).isDemo || (m as { analyseOnly?: boolean }).analyseOnly) return false
    seen.add(m.id)
    return true
  })

  const list: KantineMatch[] = []
  for (const m of docs) {
    try {
      const s = await buildMatchState(payload, m.id)
      list.push({
        id: m.id,
        reeks: reeksLabel(m.reeks),
        time: new Date(m.date).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' }),
        status: s.match.status,
        home: { name: s.teams.home.name, logoUrl: s.teams.home.logoUrl, logoFit: s.teams.home.logoFit, colors: s.teams.home.colors },
        away: { name: s.teams.away.name, logoUrl: s.teams.away.logoUrl, logoFit: s.teams.away.logoFit, colors: s.teams.away.colors },
        score: s.score,
      })
    } catch {
      // Wedstrijd met ontbrekende ploeg overslaan.
    }
  }

  return (
    <>
      <SiteHeader active="clubs" />
      <div className="kt-page">
        <h1 className="page-title"><span className="brand">Kantine</span> · kiezen</h1>
        <KantineControl matches={list} initialSelected={selectedIds} />
      </div>
    </>
  )
}
