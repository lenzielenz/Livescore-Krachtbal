import Link from 'next/link'

import { MatchDayNav } from '@/components/MatchDayNav'
import { SiteHeader } from '@/components/SiteHeader'
import { buildMatchSheet } from '@/lib/match-engine'
import { getOrCreateMatchSheet } from '@/lib/matchsheet-data'
import { getPayloadClient } from '@/lib/payload-client'
import { AftekenenPanel, type SignatureData } from './AftekenenPanel'
import '../../wedstrijdblad.css'

export const dynamic = 'force-dynamic'

export default async function AftekenenPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params
  const payload = await getPayloadClient()
  // depth 2 zodat de kapiteins (spelers) mee opgehaald worden voor de vooraf gekende namen.
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 2 }).catch(() => null)
  if (!match) {
    return (
      <>
        <SiteHeader active="clubs" />
        <div className="site">
          <p className="empty">Wedstrijd niet gevonden.</p>
          <Link href="/">← Terug</Link>
        </div>
      </>
    )
  }

  const sheet = await getOrCreateMatchSheet(payload, matchId)
  const built = await buildMatchSheet(payload, Number(matchId)).catch(() => null)

  // Vooraf gekende namen zodat niemand z'n naam hoeft te typen: kapiteins uit de wedstrijd, de
  // scheidsrechter uit het (toegewezen) wedstrijdblad.
  const naamVan = (c: unknown): string | undefined =>
    c && typeof c === 'object' ? (c as { name?: string }).name || undefined : undefined
  const refereeRes = await payload
    .find({ collection: 'matchsheets', where: { match: { equals: Number(matchId) } }, depth: 2, limit: 1 })
    .catch(() => null)
  const defaultNames = {
    kapiteinThuis: naamVan(match.homeCaptain),
    kapiteinUit: naamVan(match.awayCaptain),
    scheidsrechter: naamVan(refereeRes?.docs[0]?.assignedReferee),
  }

  return (
    <>
      <SiteHeader active="clubs" />
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

      <AftekenenPanel
        matchId={matchId}
        initialStatus={(sheet.status as string) ?? 'concept'}
        homeTeam={built?.teams.home.name}
        awayTeam={built?.teams.away.name}
        defaultNames={defaultNames}
        signatures={{
          kapiteinThuis: sheet.kapiteinThuis as SignatureData | undefined,
          kapiteinUit: sheet.kapiteinUit as SignatureData | undefined,
          scheidsrechter: sheet.scheidsrechter as SignatureData | undefined,
        }}
      />
      </div>
    </>
  )
}
