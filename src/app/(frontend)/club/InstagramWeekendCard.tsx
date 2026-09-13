import './instagram-weekend-card.css'

export function InstagramWeekendCard() {
  const src = '/api/club/instagram-weekend'
  return (
    <section className="ig-weekend" aria-labelledby="ig-weekend-title">
      <div className="ig-weekend-copy">
        <span className="ig-weekend-kicker">SOCIAL MEDIA</span>
        <h2 id="ig-weekend-title">Jouw weekendplan</h2>
        <p>Elke week automatisch gevuld met alle wedstrijden van je club, in jullie eigen kleuren.</p>
        <a className="btn btn-primary ig-weekend-download" href={`${src}?download=1`} download>
          ↓ Download Instagram Story
        </a>
        <small>1080 × 1920 px · klaar om te delen</small>
      </div>
      <a className="ig-weekend-preview" href={src} target="_blank" rel="noreferrer" aria-label="Bekijk het weekendplan op ware grootte">
        {/* Een gewone img houdt de voorvertoning licht; de PNG wordt pas op aanvraag gegenereerd. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Voorvertoning van het persoonlijke Instagram-weekendplan van de club" />
      </a>
    </section>
  )
}
