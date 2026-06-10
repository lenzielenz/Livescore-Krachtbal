import Link from 'next/link'

import { MatchDayNav } from '@/components/MatchDayNav'
import { SiteHeader } from '@/components/SiteHeader'
import { getPayloadClient } from '@/lib/payload-client'
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
        Vink je spelers aan, of vul met één klik de <strong>vaste opstelling</strong> in. Bewaar je vaste
        opstelling en ze wordt bij elke volgende wedstrijd van deze ploeg automatisch voorgesteld — de coach
        kan ze daarna nog aanpassen. Alleen leden met een geldige vergunning en de juiste leeftijdscategorie
        zijn vrij selecteerbaar; geblokkeerde leden kun je als scheidsrechter/federatie tonen en toch toevoegen.
      </p>

      <OpstellingPanes matchId={matchId} homeLabel={`Thuis — ${homeName}`} awayLabel={`Uit — ${awayName}`} />
      </div>
    </>
  )
}
