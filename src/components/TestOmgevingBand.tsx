import { andereOmgeving, isDemoOmgeving, isTestOmgeving } from '@/lib/omgeving'

import { DemoRolBand } from './DemoRolBand'

// Een duidelijke band bovenaan elke pagina van de federatie-testomgeving en de demoruimte: wie een
// demo krijgt of zelf test, ziet meteen dat dit niet de live site is (zie omgeving.ts). Op live: niets.
// In de demoruimte toont de band ook als wie je nu kijkt, met één tik terug naar het draaiboek.
export function TestOmgevingBand() {
  if (isDemoOmgeving()) return <DemoRolBand />
  if (!isTestOmgeving()) return null
  const terug = andereOmgeving()
  return (
    <div className="test-omgeving-band" role="note">
      <span>
        🧪 <b>Federatie-testomgeving</b>
        <span className="test-omgeving-uitleg"> · volledige federatieflow, aparte databank — niets hier raakt de live site</span>
      </span>
      {terug && (
        <a href={terug.url} className="test-omgeving-link">
          {terug.label} ↗
        </a>
      )}
    </div>
  )
}
