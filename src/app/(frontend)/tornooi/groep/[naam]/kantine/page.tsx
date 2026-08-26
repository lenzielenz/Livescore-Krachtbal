import { notFound } from 'next/navigation'

import { getPayloadClient } from '@/lib/payload-client'
import { buildTournamentState } from '@/lib/tournament-engine'
import { GroepKantine } from './GroepKantine'
import '../../../tornooi.css'

export const dynamic = 'force-dynamic'

// Kantinescherm van een hele tornooidag: één link die de hele dag open blijft staan en zichzelf
// aanpast (aftellen → live borden → eindstand). De eerste momentopname komt van de server; daarna
// houdt de client zichzelf bij via de groep-API.
export default async function GroepKantinePage({ params }: { params: Promise<{ naam: string }> }) {
  const { naam: ruw } = await params
  const naam = decodeURIComponent(ruw).trim()
  if (!naam) notFound()

  const payload = await getPayloadClient()
  const res = await payload
    .find({ collection: 'tournaments', where: { groep: { equals: naam } }, sort: 'createdAt', depth: 0, limit: 50 })
    .catch(() => ({ docs: [] as { id: number }[] }))
  if (res.docs.length === 0) notFound()

  const reeksen: { id: number; naam: string; champion: string | null }[] = []
  const matches: Parameters<typeof GroepKantine>[0]['initial']['matches'] = []
  for (const t of res.docs) {
    const state = await buildTournamentState(payload, t.id as number).catch(() => null)
    if (!state) continue
    reeksen.push({ id: state.id, naam: state.name, champion: state.champion ?? null })
    const alle = [...state.rounds.flatMap((r) => r.matches), ...(state.thirdPlace ? [state.thirdPlace] : [])]
    for (const m of alle) {
      if (m.status === 'finished' && (!m.home || !m.away)) continue
      matches.push({ ...m, tournamentId: state.id, reeksNaam: state.name })
    }
  }

  return <GroepKantine naam={naam} initial={{ naam, reeksen, matches }} />
}
