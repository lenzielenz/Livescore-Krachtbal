import Link from 'next/link'

import { FlowNietNodig } from '@/components/FlowNietNodig'
import { MatchDayNav } from '@/components/MatchDayNav'
import { SiteHeader } from '@/components/SiteHeader'
import { getPayloadClient } from '@/lib/payload-client'
import { isSupportersMode } from '@/lib/score-mode'
import { OpstellingPanes } from './OpstellingPanes'
import '../../wedstrijdblad.css'

export const dynamic = 'force-dynamic'

export default async function OpstellingPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params
  const payload = await getPayloadClient()
  const match = await payload
    .findByID({ collection: 'matches', id: matchId, depth: 1 })
    .catch(() => null)

  // Analysewedstrijden horen niet in de competitie-wedstrijdbladflow (privé, eigen analyse-database).
  if (!match || match.analyseOnly) {
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

  // Supportersmodus: vrije livescore, dus geen opstelling. Wie hier toch belandt (oude link,
  // bladwijzer), krijgt geen leeg selectiescherm maar de weg naar het aantekenen.
  if (await isSupportersMode(payload)) {
    return (
      <FlowNietNodig
        stap="Opstelling"
        matchId={matchId}
        wedstrijd={String(match.title ?? '')}
        uitleg="Het platform staat op vrije livescore: je hoeft geen spelers te selecteren om te kunnen aantekenen."
      />
    )
  }

  const home = match.homeTeam as { name?: string } | number | null
  const away = match.awayTeam as { name?: string } | number | null
  const homeName = typeof home === 'object' ? (home?.name ?? 'Thuis') : 'Thuis'
  const awayName = typeof away === 'object' ? (away?.name ?? 'Uit') : 'Uit'

  return (
    <>
      <SiteHeader active="clubs" />
      <div className="site">
      <h1 className="page-title">
        Opstelling <span className="brand">·</span> {String(match.title ?? '')}
      </h1>
      <MatchDayNav matchId={matchId} current="opstelling" />
      <p className="wb-intro">
        Vink je spelers aan of vul met één klik de <strong>vaste opstelling</strong> in — die wordt bij
        elke volgende wedstrijd automatisch voorgesteld. Enkel leden met een geldige vergunning en de
        juiste leeftijdscategorie zijn selecteerbaar.
      </p>

      <OpstellingPanes matchId={matchId} homeLabel={`Thuis — ${homeName}`} awayLabel={`Uit — ${awayName}`} />
      </div>
    </>
  )
}
