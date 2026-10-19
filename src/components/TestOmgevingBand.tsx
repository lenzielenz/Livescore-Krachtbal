import { andereOmgeving, isTestOmgeving } from '@/lib/omgeving'

// Een duidelijke band bovenaan elke pagina van de federatie-testomgeving: wie een demo krijgt of
// zelf test, ziet meteen dat dit niet de live site is (zie omgeving.ts). Op live: niets.
export function TestOmgevingBand() {
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
