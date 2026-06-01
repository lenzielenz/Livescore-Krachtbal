import Link from 'next/link'

import { buildMatchSheet } from '@/lib/match-engine'
import { getOrCreateMatchSheet } from '@/lib/matchsheet-data'
import { getPayloadClient } from '@/lib/payload-client'
import { AftekenenPanel } from './AftekenenPanel'

export const dynamic = 'force-dynamic'

export default async function AftekenenPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params
  const payload = await getPayloadClient()
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  if (!match) {
    return (
      <div className="site">
        <p className="empty">Wedstrijd niet gevonden.</p>
        <Link href="/">← Terug</Link>
      </div>
    )
  }

  const sheet = await getOrCreateMatchSheet(payload, matchId)
  const built = await buildMatchSheet(payload, Number(matchId)).catch(() => null)

  return (
    <div className="site">
      <header className="site-header">
        <h1>
          Aftekenen <span className="brand">·</span> {String(match.title ?? '')}
        </h1>
        <nav className="site-nav">
          <Link href={`/match/${matchId}/sheet`}>Wedstrijdblad</Link>
          <Link href={`/scheidsrechter/${matchId}`}>Scheidsrechter</Link>
        </nav>
      </header>

      {built && (
        <p className="empty">
          Eindstand: <strong>{built.teams.home.name} {built.totals.home} – {built.totals.away} {built.teams.away.name}</strong>.
          Beide kapiteins tekenen af; daarna dient de scheidsrechter in.
        </p>
      )}

      <AftekenenPanel matchId={matchId} initialStatus={(sheet.status as string) ?? 'concept'} />
    </div>
  )
}
