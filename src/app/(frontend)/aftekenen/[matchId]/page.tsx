import Link from 'next/link'

import { MatchDayNav } from '@/components/MatchDayNav'
import { SiteHeader } from '@/components/SiteHeader'
import { buildMatchSheet } from '@/lib/match-engine'
import { getOrCreateMatchSheet } from '@/lib/matchsheet-data'
import { getPayloadClient } from '@/lib/payload-client'
import { AftekenenPanel } from './AftekenenPanel'
import '../../wedstrijdblad.css'

export const dynamic = 'force-dynamic'

export default async function AftekenenPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params
  const payload = await getPayloadClient()
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  if (!match) {
    return (
      <>
        <SiteHeader active="aantekenen" />
        <div className="site">
          <p className="empty">Wedstrijd niet gevonden.</p>
          <Link href="/">← Terug</Link>
        </div>
      </>
    )
  }

  const sheet = await getOrCreateMatchSheet(payload, matchId)
  const built = await buildMatchSheet(payload, Number(matchId)).catch(() => null)

  return (
    <>
      <SiteHeader active="aantekenen" />
      <div className="site">
      <h1 className="page-title">
        Aftekenen <span className="brand">·</span> {String(match.title ?? '')}
      </h1>
      <MatchDayNav matchId={matchId} current="aftekenen" />

      {built && (
        <p className="wb-intro">
          Eindstand: <strong>{built.teams.home.name} {built.totals.home} – {built.totals.away} {built.teams.away.name}</strong>.
          Beide kapiteins tekenen af; daarna dient de scheidsrechter in.
        </p>
      )}

      <AftekenenPanel matchId={matchId} initialStatus={(sheet.status as string) ?? 'concept'} />
      </div>
    </>
  )
}
