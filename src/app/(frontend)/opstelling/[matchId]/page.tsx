import Link from 'next/link'

import { getPayloadClient } from '@/lib/payload-client'
import { OpstellingEditor } from './OpstellingEditor'
import '../../wedstrijdblad.css'

export const dynamic = 'force-dynamic'

export default async function OpstellingPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params
  const payload = await getPayloadClient()
  const match = await payload
    .findByID({ collection: 'matches', id: matchId, depth: 1 })
    .catch(() => null)

  if (!match) {
    return (
      <div className="site">
        <p className="empty">Wedstrijd niet gevonden.</p>
        <Link href="/">← Terug</Link>
      </div>
    )
  }

  const home = match.homeTeam as { name?: string } | number | null
  const away = match.awayTeam as { name?: string } | number | null
  const homeName = typeof home === 'object' ? (home?.name ?? 'Thuis') : 'Thuis'
  const awayName = typeof away === 'object' ? (away?.name ?? 'Uit') : 'Uit'

  return (
    <div className="site">
      <header className="site-header">
        <h1>
          Opstelling <span className="brand">·</span> {String(match.title ?? '')}
        </h1>
        <nav className="site-nav">
          <Link href="/">Live-site</Link>
          <Link href="/admin">Beheer</Link>
        </nav>
      </header>
      <p className="wb-intro">
        Vink je spelers aan. Het voorstel toont de laatst-gekende opstelling. Alleen leden met een geldige
        vergunning en de juiste leeftijdscategorie zijn vrij selecteerbaar — geblokkeerde leden kun je als
        scheidsrechter/federatie tonen en toch toevoegen (gaat in de override-log).
      </p>

      <div className="wb-grid">
        <OpstellingEditor matchId={matchId} side="home" label={`Thuis — ${homeName}`} />
        <OpstellingEditor matchId={matchId} side="away" label={`Uit — ${awayName}`} />
      </div>
    </div>
  )
}
