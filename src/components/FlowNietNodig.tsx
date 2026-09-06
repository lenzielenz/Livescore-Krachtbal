import Link from 'next/link'

import { SiteHeader, type NavSection } from '@/components/SiteHeader'

// "Deze stap bestaat niet in supportersmodus."
//
// Opstelling, scheidsrechtersakkoord en aftekenen horen bij de federatieflow. Staat het platform op
// vrije livescore, dan valt die hele keten weg — maar de routes blijven bestaan: een oude link, een
// bladwijzer, een doorgestuurde URL. Zo'n pagina mag dan geen leeg formulier tonen dat nergens heen
// leidt (het scheidsrechterspaneel eindigde zelfs in een knop die nooit aanklikbaar werd). Eén zin
// waarom de stap er niet is, en één knop naar waar het wél gebeurt.
export function FlowNietNodig({
  stap,
  matchId,
  wedstrijd,
  uitleg,
  sectie = 'clubs',
}: {
  /** Naam van de stap die wegvalt, bv. 'Opstelling'. */
  stap: string
  matchId: string | number
  /** Titel van de wedstrijd, als ze bekend is. */
  wedstrijd?: string | null
  /** Waarom deze stap in supportersmodus niet bestaat. */
  uitleg: string
  sectie?: NavSection
}) {
  return (
    <>
      <SiteHeader active={sectie} />
      <div className="site">
        <h1 className="page-title">
          {stap} <span className="brand">·</span> {wedstrijd || 'wedstrijd'}
        </h1>
        <p className="empty">
          <strong>Niet nodig in supportersmodus.</strong> {uitleg}
        </p>
        <p className="sk-login-actions">
          <Link href={`/scorekeeper/${matchId}`} className="match-score-cta">
            <span aria-hidden>✏️</span>
            <span>Aantekenen</span>
            <span className="match-score-cta-arrow" aria-hidden>→</span>
          </Link>
          <Link href={`/match/${matchId}`} className="back-link">Naar de wedstrijd →</Link>
        </p>
      </div>
    </>
  )
}
