import { SiteHeader } from '@/components/SiteHeader'
import { Stemmen } from './Stemmen'
import './referendum.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Referendum — Krachtbal Live' }

// Stemmen voor speler/speelster van het jaar. Wat je ziet (en of je mag stemmen) komt van
// /api/referendum/stem: daar gelden de regels (minimum wedstrijden, niet de eigen club, niet jezelf).
export default function ReferendumPage() {
  return (
    <>
      <SiteHeader />
      <div className="site">
        <h1 className="page-title">🏅 Referendum</h1>
        <p className="acc-page-intro">
          Wie speelde het beste seizoen? Geef <strong>5, 4, 3, 2 en 1 punt</strong> aan vijf spelers uit jouw competitie — niet
          van je eigen club. De punten van alle spelers samen bepalen de speler en speelster van het jaar, en de beloftes.
        </p>
        <Stemmen />
      </div>
    </>
  )
}
