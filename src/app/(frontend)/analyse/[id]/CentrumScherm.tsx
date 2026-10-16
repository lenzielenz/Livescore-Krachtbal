import Link from 'next/link'

import { ondertekendeUrl } from '@/lib/app-analyse'

import './app-analyse.css'

// Het wedstrijdcentrum van de app schermvullend: op de gsm is dit dé manier om de analyse te
// bekijken. Een smalle balk bovenaan brengt je terug naar de analysepagina.
export function CentrumScherm({ matchId, titel, terugHref }: { matchId: number; titel: string; terugHref: string }) {
  return (
    <div className="appc">
      <div className="appc-balk">
        <Link href={terugHref}>← Terug</Link>
        <span>{titel}</span>
      </div>
      <iframe
        src={ondertekendeUrl(matchId, 'wedstrijdcentrum.html')}
        title={`Wedstrijdcentrum · ${titel}`}
        sandbox="allow-scripts allow-popups allow-downloads allow-modals"
        allow="fullscreen"
      />
    </div>
  )
}
