import './winfie-card.css'

export function WinfieCard({ matchId }: { matchId: number }) {
  const src = `/api/match/${matchId}/winfie`
  return (
    <section className="winfie-card" aria-labelledby="winfie-title">
      <div className="winfie-copy">
        <span className="winfie-kicker">KLAAR OM TE DELEN</span>
        <h2 id="winfie-title">Download de Winfie</h2>
        <p>
          Eindscore, scoreverloop en de kleuren van de winnaar in één herkenbare Story.
          Heb je zelf een tribunefoto geplaatst? Dan verwerken we die automatisch.
        </p>
        <a className="btn btn-primary winfie-download" href={`${src}?download=1`} download>
          ↓ Download Winfie
        </a>
        <small>1080 × 1920 px · uniek voor deze wedstrijd</small>
      </div>
      <a className="winfie-preview" href={src} target="_blank" rel="noreferrer" aria-label="Bekijk de Winfie op ware grootte">
        {/* Dynamisch gegenereerde PNG; een gewone img laat cookies meegeven voor de eigen foto. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Voorvertoning van de Winfie van deze wedstrijd" loading="lazy" />
      </a>
    </section>
  )
}
