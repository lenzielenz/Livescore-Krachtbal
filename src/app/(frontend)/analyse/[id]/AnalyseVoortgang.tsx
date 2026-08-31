import Link from 'next/link'

// Hoe ver staat deze analyse? Zonder dit overzicht moet je zelf onthouden wat er nog moet
// gebeuren — en met een pagina van acht schermen is dat niet te doen.
//
// Wat er in de 100% telt, is bewust veranderd. Vroeger stond de ijking van de wedstrijdklok
// bij de kernstappen: op welke seconde in de video begint elke helft. Dat is nuttig om naar een
// doelpunt te springen, maar het is niet wat de analyse mééét. Wat wél telt is de veldkalibratie
// (zonder de veldlijnen weet niets waar de bal landt) en de automatische analyse zelf. De ijking
// zakt daarom naar "extra": handig, niet noodzakelijk.

export type VoortgangInput = {
  matchId: number
  /**
   * Welke weg is er gekozen?
   *  'manueel' — elke worp wordt met de hand aangetekend; de video is er om te herbekijken.
   *  'video'   — er wordt niets ingevoerd; alles komt uit de opname.
   * De stappen naar 100% verschillen daardoor: bij 'video' is "wedstrijd aantekenen" geen stap
   * die nog moet gebeuren, en zou ze eeuwig op onvoltooid blijven staan.
   */
  modus?: 'manueel' | 'video' | null
  /** Aantal aangetekende worpen (de basis: zonder worpen valt er niets te vergelijken). */
  worpen: number
  videoGekoppeld: boolean
  ijkH1: boolean
  ijkH2: boolean
  /** Heeft de wedstrijd een tweede helft gespeeld? Zo niet, dan hoeft H2 niet geijkt. */
  tweedeHelftGespeeld: boolean
  /** Aantal spelers met fysieke stats uit de videotracking (cv/fysiek.py of de serveranalyse). */
  fysiekSpelers: number
  /** Opgemeten terrein ingevuld (anders rekent alles op het reglementaire veld). */
  terreinOpgemeten: boolean
  /** Open CV-voorstellen die nog een menselijk oordeel wachten (enkel federatie ziet die). */
  openVoorstellen: number
  /** Aangeduide veldkruisingen en over hoeveel ijkbeelden ze verdeeld staan. */
  kalibratiePunten: number
  kalibratieBeelden: number
  /** Stand van de laatste serveranalyse, en met welke precisie ze draaide. */
  analyseStatus?: 'wachtrij' | 'bezig' | 'klaar' | 'mislukt' | 'afgebroken' | null
  analyseStand?: string | null
  /** Voorstellen die de analyse opleverde, en hoeveel je er al beoordeeld hebt. */
  voorstellen: number
  beoordeeld: number
}

export type Stap = { klaar: boolean; titel: string; hulp: string; anker?: string }

const KRUISPUNTEN = 14

/**
 * De stappen naar 100%, per weg.
 *
 * Apart en zuiver omdat hier de regel in zit die stil fout kan gaan: bij de video-weg mag
 * "wedstrijd aantekenen" er niet bij staan (niemand tekent daar iets aan, dus dat vinkje zou
 * nooit groen worden), en moet het beoordelen er juist wél bij.
 */
export function voortgangStappen(p: VoortgangInput): Stap[] {
  const geanalyseerd = p.analyseStatus === 'klaar' || p.voorstellen > 0
  const genoegKalibratie = p.kalibratiePunten >= 4
  const viaVideo = p.modus === 'video'

  const stappen: Stap[] = [
    // Bij de video-weg tekent niemand iets aan: dan is het aantal worpen geen stap maar een
    // uitkomst, en zou een onvoltooid vinkje enkel in de weg staan.
    ...(viaVideo
      ? []
      : [{
          klaar: p.worpen > 0,
          titel: p.worpen > 0 ? `Wedstrijd aangetekend (${p.worpen} worpen)` : 'Wedstrijd aantekenen',
          hulp: 'Elke worp op het veldschema is de basis: daaruit volgen score, zones, afstanden en alle statistieken.',
        }]),
    {
      klaar: p.videoGekoppeld,
      titel: p.videoGekoppeld ? 'Video gekoppeld' : 'Video koppelen',
      hulp: 'Upload de opname in het blok Video-analyse. Uploaden (geen YouTube-link) is nodig om te kunnen kalibreren.',
      anker: '#video',
    },
    {
      klaar: genoegKalibratie,
      titel: genoegKalibratie
        ? `Veld gekalibreerd (${p.kalibratiePunten} van de ${KRUISPUNTEN} punten${
            p.kalibratieBeelden > 1 ? ` over ${p.kalibratieBeelden} beelden` : ''
          })`
        : 'Veld kalibreren',
      hulp:
        'Wijs de lijnkruisingen aan op een beeld uit de video. Zonder dat kan de analyse wél zien wannéér er '
        + 'geworpen wordt, maar niet waar de bal landt — en dus geen zones, afstanden of veldkaart.',
      anker: '#kalibratie',
    },
    {
      klaar: geanalyseerd,
      titel: geanalyseerd
        ? `Video geanalyseerd${p.analyseStand ? ` (stand ${p.analyseStand})` : ''}${
            p.voorstellen > 0 ? ` — ${p.voorstellen} voorstellen` : ''
          }`
        : 'Video automatisch laten analyseren',
      hulp:
        'De server kijkt de opname door en stelt worpen voor, met landingspunt en afstand. Duurt minuten tot '
        + 'uren; met de stand "ultra" laat je ze een nacht doorrekenen.',
      anker: '#serveranalyse',
    },
  ]

  if (viaVideo) {
    stappen.push({
      klaar: p.beoordeeld > 0 && p.beoordeeld >= p.voorstellen,
      titel:
        p.voorstellen > 0 && p.beoordeeld >= p.voorstellen
          ? `Voorstellen beoordeeld (${p.beoordeeld})`
          : 'Voorstellen beoordelen',
      hulp:
        'Op deze weg is jouw oordeel de laatste stap: bevestig of wijs af wat het model aandroeg. '
        + 'Pas dan staat er iets vast — en het is meteen de data waarmee het model bijgesteld wordt.',
      anker: '#video',
    })
  }

  return stappen
}

export function AnalyseVoortgang(p: VoortgangInput) {
  const viaVideo = p.modus === 'video'
  const stappen = voortgangStappen(p)
  const klaar = stappen.filter((s) => s.klaar).length
  const pct = Math.round((klaar / stappen.length) * 100)
  const volledig = klaar === stappen.length
  const teBeoordelen = Math.max(0, p.voorstellen - p.beoordeeld)

  return (
    <section className={`av${volledig ? ' av-klaar' : ''}`} aria-label="Analyse-voortgang">
      <div className="av-kop">
        <h2 className="av-titel">
          {volledig ? '✅ Analyse volledig' : '📈 Analyse-voortgang'}
          <span className="av-modus">{viaVideo ? '🎥 alles uit de video' : '✍️ manueel aangetekend'}</span>
        </h2>
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

      {/* Loopt er nu iets, dan hoort dat bovenaan te staan — niet verstopt tussen de extra's. */}
      {(p.analyseStatus === 'bezig' || p.analyseStatus === 'wachtrij') && (
        <p className="av-bezig">
          🤖 De automatische analyse draait nu. <a href="#serveranalyse">volg ze →</a>
        </p>
      )}
      {p.analyseStatus === 'mislukt' && (
        <p className="av-mislukt">
          ❌ De laatste automatische analyse is mislukt. <a href="#serveranalyse">kijk waarom →</a>
        </p>
      )}

      {/* Wat je bovenop de 100% kunt doen. */}
      <div className="av-extra">
        <span className="av-extra-kop">Extra (niet nodig voor 100%)</span>
        <ul>
          {p.voorstellen > 0 && !viaVideo && (
            <li className={teBeoordelen === 0 ? 'ok' : ''}>
              <span aria-hidden>{teBeoordelen === 0 ? '✓' : '·'}</span> Voorstellen beoordelen:{' '}
              {teBeoordelen === 0
                ? `alle ${p.voorstellen} beoordeeld — dat is meteen de trainingsdata van het model`
                : `${teBeoordelen} van de ${p.voorstellen} wachten op je oordeel`}{' '}
              <a href="#video">bekijken →</a>
            </li>
          )}
          {p.openVoorstellen > 0 && p.voorstellen === 0 && (
            <li>
              <span aria-hidden>·</span> {p.openVoorstellen} CV-voorstellen wachten op je oordeel{' '}
              <a href="#video">bekijken →</a>
            </li>
          )}
          <li className={p.kalibratiePunten >= KRUISPUNTEN ? 'ok' : ''}>
            <span aria-hidden>{p.kalibratiePunten >= KRUISPUNTEN ? '✓' : '·'}</span> Alle veertien
            kruisingen: {p.kalibratiePunten >= KRUISPUNTEN
              ? 'aangeduid — de meting is zo scherp als ze kan zijn'
              : `${p.kalibratiePunten} gezet; hoe meer punten, hoe nauwkeuriger de meters`}{' '}
            <a href="#kalibratie">aanvullen →</a>
          </li>
          <li className={p.ijkH1 ? 'ok' : ''}>
            <span aria-hidden>{p.ijkH1 ? '✓' : '·'}</span> Aftrap geijkt:{' '}
            {p.ijkH1
              ? p.tweedeHelftGespeeld && !p.ijkH2
                ? '1e helft — ijk ook de 2e om daar naar doelpunten te springen'
                : 'elk doelpunt springt naar het juiste beeld'
              : 'nog niet — nodig om vanuit de lijst naar een doelpunt te springen, niet om te meten'}{' '}
            <a href="#video">zetten →</a>
          </li>
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
              : 'nog geen — vink "ook spelers volgen" aan bij de automatische analyse'}
          </li>
        </ul>
      </div>

      <details className="av-handleiding">
        <summary>📖 Hoe werkt een analyse? — stap voor stap</summary>
        <ol className="av-uitleg">
          <li>
            <strong>Film de wedstrijd.</strong> Eén vaste plek is het makkelijkst (hoog op de
            middellijn is ideaal, maar achter een doel of op een hoek kan ook). Beweegt de camera
            of houd je ze in de hand, dan kan dat ook — vink later "camera bewoog" aan.
          </li>
          <li>
            <strong>Kies je weg.</strong> Bij het aanmaken van een analysewedstrijd kies je
            tussen <em>manueel aantekenen</em> — elke worp zelf aantikken op het veldschema — en
            {' '}<em>alles uit de video</em>, waarbij je niets invoert en de server de opname
            doorrekent. Deze analyse staat op:{' '}
            <strong>{viaVideo ? 'alles uit de video' : 'manueel aantekenen'}</strong>.
          </li>
          {!viaVideo && (
            <li>
              <strong>Teken de wedstrijd aan.</strong> Kies de veldspelers en tik elke worp aan op
              het veldschema. Alles wordt bewaard terwijl je bezig bent — er is geen
              &quot;opslaan&quot;-knop nodig.
            </li>
          )}
          <li>
            <strong>Upload de video.</strong> Op deze pagina, in het blok Video-analyse. Uploaden
            en niet een YouTube-link plakken: een YouTube-speler laat zijn beeld niet uitlezen, en
            dan kan er niet gekalibreerd worden.
          </li>
          <li>
            <strong>Kalibreer het veld.</strong> Neem een beeld waarop je veldlijnen ziet en wijs
            de kruisingen aan. Vergroot met de knoppen en gebruik de loep: één schermpixel is al
            gauw vijf beeldpixels, en dat verschil zie je later terug in de gemeten meters. Zie je
            niet alle veertien punten op één beeld — bij een pannende camera normaal — neem dan
            een tweede beeld en duid daar de rest aan.
          </li>
          <li>
            <strong>Laat de video analyseren.</strong> Kies een precisie en druk op de knop. Wat
            de standen betekenen: <em>snel</em> kijkt 3 keer per seconde met het lichte model,
            <em>gewoon</em> 5 keer, <em>nauwkeurig</em> 8 keer met het zware model, en
            {' '}<em>ultra</em> 15 keer — die laatste zet je aan vóór je gaat slapen. Je ziet
            onderweg hoe ver ze staat en rond welk uur ze klaar is; de pagina mag dicht.
          </li>
          <li>
            <strong>Beoordeel de voorstellen.</strong> Elk voorstel staat op zijn eigen tijdstip in
            de video: bevestigen of afwijzen. Dat is meteen het cijfer waar je iets aan hebt —
            hoeveel van wat het model aandroeg, klopte — én de data waarmee het model bijgesteld
            wordt.
          </li>
          <li>
            <strong>Klopt het veld niet met het reglement?</strong> Meet breedte en de afstand
            tussen de doellijnen op en vul ze in bij Terreinmaten — dan kloppen alle afstanden in
            meters met dít terrein.
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
