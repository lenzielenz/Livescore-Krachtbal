import Link from 'next/link'

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

  // Supporters-modus (vrije livescore) kent geen opstelling: er is geen wedstrijdblad om te vullen
  // en geen scheidsrechter die ze goedkeurt. Wie hier toch belandt — een oude link, een bladwijzer,
  // een gedeelde URL — krijgt de weg naar het aantekenen in plaats van een formulier dat nergens
  // toe leidt.
  if (await isSupportersMode(payload)) {
    return (
      <>
        <SiteHeader active="clubs" />
        <div className="site">
          <h1 className="page-title">
            Opstelling <span className="brand">·</span> {String(match.title ?? '')}
          </h1>
          <p className="empty">
            Het platform staat in <strong>vrije livescore</strong>. Er is dan geen opstelling en geen
            akkoord van de scheidsrechter nodig — je geeft gewoon de score door.
          </p>
          <p>
            <Link href={`/scorekeeper/${matchId}`} className="match-score-cta">
              <span aria-hidden>✍️</span>
              <span>Naar het aantekenen</span>
              <span className="match-score-cta-arrow" aria-hidden>→</span>
            </Link>
          </p>
          <p>
            <Link href="/club" className="back-link">← Terug naar mijn club</Link>
          </p>
        </div>
      </>
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
