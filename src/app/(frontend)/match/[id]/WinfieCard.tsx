import { renderWinfieDesign, type WinfieDesign } from '@/lib/winfie-design'
import './winfie-card.css'

// Toont de Winfie — de deelbare Story van deze wedstrijd — rechtstreeks op de pagina. Geen
// download/deel-knop meer: gewoon tonen, in de sitestijl, zodat het altijd werkt (geen
// server-gegenereerde PNG die kan mislukken of te traag kan zijn). Wie de Story wil delen,
// maakt gewoon een schermafbeelding.
export function WinfieCard({ design }: { design: WinfieDesign }) {
  const svg = renderWinfieDesign(design)

  return (
    <section className="winfie-card" aria-labelledby="winfie-title">
      <div className="winfie-copy">
        <span className="winfie-kicker">JOUW WEDSTRIJD · JOUW MOMENT</span>
        <h2 id="winfie-title">Winfie</h2>
        <p>
          De Story van deze wedstrijd: clublogo&rsquo;s, eindstand, scoreverloop en de kleuren van de
          winnaar. {design.photoHref ? 'Jouw eigen tribunefoto staat erop.' : 'Voeg een tribunefoto toe en ze verschijnt hier automatisch.'}
        </p>
        <small>Instagram Story-formaat · 9:16</small>
      </div>
      {/* Server-gegenereerde SVG, veilig: alle tekst erin is al geëscaped door renderWinfieDesign. */}
      <div className="winfie-preview" dangerouslySetInnerHTML={{ __html: svg }} />
    </section>
  )
}
