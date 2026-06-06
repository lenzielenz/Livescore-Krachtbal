import { SiteHeader } from '@/components/SiteHeader'
import { buildMatchState } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'
import { readVeldMatchId } from '@/lib/screen-selection'
import { CastHub, type CastMatch } from './CastHub'
import './cast.css'

export const dynamic = 'force-dynamic'

const reeksLabel = (v: unknown) => reeksNaam(v)

function todayBounds(): { start: string; end: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start: start.toISOString(), end: end.toISOString() }
}

// Casten — bedienpagina: vanaf je gsm/laptop stuur je het veldscherm én het
// kantinescherm naar twee Chromecasts, terwijl je hier de controle houdt. Het
// eigenlijke beeld draait op de tv's; deze pagina kiest enkel wat erop komt.
export default async function CastPage() {
  const payload = await getPayloadClient()
  const { start, end } = todayBounds()

  // Wedstrijden van vandaag + alle live wedstrijden (ook als hun datum afwijkt).
  const [dayRes, liveRes] = await Promise.all([
    payload.find({ collection: 'matches', where: { date: { greater_than_equal: start, less_than: end } }, sort: 'date', depth: 0, limit: 200 }),
    payload.find({ collection: 'matches', where: { status: { equals: 'live' } }, depth: 0, limit: 50 }),
  ])

  const seen = new Set<number>()
  const docs = [...liveRes.docs, ...dayRes.docs].filter((m) => {
    if (seen.has(m.id) || (m as { isDemo?: boolean }).isDemo || (m as { analyseOnly?: boolean }).analyseOnly) return false
    seen.add(m.id)
    return true
  })

  const matches: CastMatch[] = []
  for (const m of docs) {
    try {
      const s = await buildMatchState(payload, m.id)
      matches.push({
        id: m.id,
        reeks: reeksLabel(m.reeks),
        time: new Date(m.date).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' }),
        status: s.match.status,
        home: s.teams.home.name,
        away: s.teams.away.name,
      })
    } catch {
      // Wedstrijd met ontbrekende ploeg overslaan.
    }
  }

  const veldId = await readVeldMatchId(payload)

  return (
    <>
      <SiteHeader active="clubs" />
      <div className="cast-page">
        <h1 className="page-title"><span className="brand">Naar tv</span> · schermen</h1>
        <CastHub matches={matches} initialVeldId={veldId} />
      </div>
    </>
  )
}
