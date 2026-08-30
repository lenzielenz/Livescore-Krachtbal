import Link from 'next/link'

// Hoe ver staat deze analyse? Zonder dit overzicht moet je zelf onthouden wat er nog moet
// gebeuren — en met een pagina van acht schermen is dat niet te doen. De balk telt de stappen
// die je ín de app zet; de fysieke meting draait buiten de app (Python) en telt daarom niet mee
// voor de 100%, maar staat er wel bij als extra, met de uitleg hoe je ze zet.

export type VoortgangInput = {
  matchId: number
  /** Aantal aangetekende worpen (de basis: zonder worpen valt er niets te analyseren). */
  worpen: number
  videoGekoppeld: boolean
  ijkH1: boolean
  ijkH2: boolean
  /** Heeft de wedstrijd een tweede helft gespeeld? Zo niet, dan hoeft H2 niet geijkt. */
  tweedeHelftGespeeld: boolean
  /** Aantal spelers met fysieke stats uit de videotracking (cv/fysiek.py). */
  fysiekSpelers: number
  /** Opgemeten terrein ingevuld (anders rekent alles op het reglementaire veld). */
  terreinOpgemeten: boolean
  /** Open CV-voorstellen die nog een menselijk oordeel wachten (enkel federatie ziet die). */
  openVoorstellen: number
}

type Stap = { klaar: boolean; titel: string; hulp: string; anker?: string }

export function AnalyseVoortgang(p: VoortgangInput) {
  // De H2-ijking telt alleen mee als er een tweede helft gespeeld is.
  const stappen: Stap[] = [
    {
      klaar: p.worpen > 0,
      titel: p.worpen > 0 ? `Wedstrijd aangetekend (${p.worpen} worpen)` : 'Wedstrijd aantekenen',
      hulp: 'Elke worp op het veldschema is de basis: daaruit volgen score, zones, afstanden en alle statistieken.',
    },
    {
      klaar: p.videoGekoppeld,
      titel: p.videoGekoppeld ? 'Video gekoppeld' : 'Video koppelen',
      hulp: 'Upload de opname of plak een YouTube-link in het blok Video-analyse.',
      anker: '#video',
    },
    {
      klaar: p.ijkH1,
      titel: 'Aftrap 1e helft geijkt',
      hulp: 'Zet de video op de aftrap van de 1e helft en tik "IJk H1 hier". Daarna springt elk doelpunt naar het juiste beeld.',
      anker: '#video',
    },
    ...(p.tweedeHelftGespeeld
      ? [{
          klaar: p.ijkH2,
          titel: 'Aftrap 2e helft geijkt',
          hulp: 'Zelfde als hierboven, maar dan op de aftrap van de 2e helft ("IJk H2 hier").',
          anker: '#video',
        }]
      : []),
  ]

  const klaar = stappen.filter((s) => s.klaar).length
  const pct = Math.round((klaar / stappen.length) * 100)
  const volledig = klaar === stappen.length

  return (
    <section className={`av${volledig ? ' av-klaar' : ''}`} aria-label="Analyse-voortgang">
      <div className="av-kop">
        <h2 className="av-titel">{volledig ? '✅ Analyse volledig' : '📈 Analyse-voortgang'}</h2>
        <span className="av-pct">{pct}%</span>
      </div>
      <div
        className="av-balk"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${klaar} van ${stappen.length} stappen klaar`}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="av-tel">{klaar} van de {stappen.length} stappen klaar</p>

      <ol className="av-stappen">
        {stappen.map((s) => (
          <li key={s.titel} className={s.klaar ? 'ok' : 'todo'}>
            <span className="av-vink" aria-hidden>{s.klaar ? '✓' : '○'}</span>
            <span className="av-stap-body">
              <span className="av-stap-titel">{s.titel}</span>
              {!s.klaar && <span className="av-stap-hulp">{s.hulp}</span>}
            </span>
            {!s.klaar && s.anker && <a className="av-ga" href={s.anker}>ga →</a>}
          </li>
        ))}
      </ol>

      {/* Wat je bovenop de 100% kunt doen. Bewust apart: dit hangt af van stappen buiten de app. */}
      <div className="av-extra">
        <span className="av-extra-kop">Extra (niet nodig voor 100%)</span>
        <ul>
          <li className={p.terreinOpgemeten ? 'ok' : ''}>
            <span aria-hidden>{p.terreinOpgemeten ? '✓' : '·'}</span> Terreinmaten:{' '}
            {p.terreinOpgemeten
              ? 'opgemeten ingevuld — alle meters kloppen met dit veld'
              : 'nu reglementair (14 × 26 m)'}{' '}
            <a href="#terreinmaten">aanpassen →</a>
          </li>
          <li className={p.fysiekSpelers > 0 ? 'ok' : ''}>
            <span aria-hidden>{p.fysiekSpelers > 0 ? '✓' : '·'}</span> Fysieke stats:{' '}
            {p.fysiekSpelers > 0
              ? `${p.fysiekSpelers} spelers met loopafstand, sprintjes en topsnelheid`
              : 'nog geen — die komen uit de videotracking (zie de handleiding)'}
          </li>
          {p.openVoorstellen > 0 && (
            <li>
              <span aria-hidden>·</span> {p.openVoorstellen} CV-voorstellen wachten op je oordeel{' '}
              <a href="#video">bekijken →</a>
            </li>
          )}
        </ul>
      </div>

      <details className="av-handleiding">
        <summary>📖 Hoe werkt een analyse? — stap voor stap</summary>
        <ol className="av-uitleg">
          <li>
            <strong>Film de wedstrijd.</strong> Eén vaste plek is het makkelijkst (hoog op de
            middellijn is ideaal, maar achter een doel of op een hoek kan ook). Laat de camera
            lopen; de hele helft in één stuk scheelt later ijkwerk.
          </li>
          <li>
            <strong>Teken de wedstrijd aan.</strong> Maak op het clubhuis een analysewedstrijd,
            kies de veldspelers en tik elke worp aan op het veldschema. Alles wordt bewaard terwijl
            je bezig bent — er is geen "opslaan"-knop nodig.
          </li>
          <li>
            <strong>Koppel de video.</strong> Op deze pagina, in het blok Video-analyse: uploaden
            of een YouTube-link plakken.
          </li>
          <li>
            <strong>IJk de helften.</strong> Zet de video op de aftrap van de 1e helft en tik
            "IJk H1 hier"; hetzelfde voor de 2e helft. Vanaf dan springt elk doelpunt in de lijst
            rechtstreeks naar het juiste beeld. Hiermee sta je op 100%.
          </li>
          <li>
            <strong>Klopt het veld niet met het reglement?</strong> Meet breedte en de afstand
            tussen de doellijnen op en vul ze in bij Terreinmaten — dan kloppen alle afstanden in
            meters met dít terrein.
          </li>
          <li>
            <strong>Extra: loopafstand en sprintjes.</strong> Die worden niet in de app berekend
            maar door de tracking-programma&apos;s in de map <code>cv/</code>, op een computer:
            {' '}<code>python3 cv/meet.py --video match.mp4 --match {p.matchId} --kalibratie k.json --tracking</code>.
            Daarna vul je <code>wie.json</code> in (welk spoor is welke speler) en uploadt
            {' '}<code>cv/fysiek.py --upload</code> de cijfers naar deze pagina. Zie
            {' '}<code>cv/README.md</code> voor de volledige uitleg.
          </li>
        </ol>
        <p className="av-uitleg-slot">
          Klaar? Dan staat alles hieronder: de veldkaart met elke worp, de spelerskaarten en het
          scoreverloop. <Link href="/analyse">Terug naar alle analyses</Link>
        </p>
      </details>
    </section>
  )
}
