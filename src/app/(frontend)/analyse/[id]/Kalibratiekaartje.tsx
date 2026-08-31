'use client'

import { DWARSLIJNEN, ZIJDEN, labelVan, omschrijving, type Zijde } from '@/lib/kalibratie-punten'

// Een veldkaartje naast het ijkbeeld: wélk punt duid je nu aan?
//
// De namen alleen ("vrijeworplijn uitkant — rechts") zijn juist maar niet genoeg: op een beeld
// waar je de overkant nauwelijks ziet, moet je in je hoofd omrekenen waar dat dan ligt. Eén
// verkeerd geplaatst punt verzet de hele homografie, en dat merk je pas als de gemeten landing
// er meters naast ligt.
//
// Het kaartje ligt LIGGEND: de lengte van het veld van links naar rechts, want zo staat het
// meestal ook in beeld en zo past het op een telefoon. De thuiskant ligt links.
//
// Welke zijlijn "links" is, is geen kwestie van hoe jij toevallig kijkt maar een afspraak uit
// het reglementmodel (zie kalibratie-punten.ts): je staat op de achterlijn aan de THUISKANT en
// kijkt naar de uitkant. Doe je dat, dan wijst je linkerhand naar de bovenkant van dit kaartje.
// Die zin staat er ook bij — zonder houvast zet iedereen vroeg of laat links en rechts om, en
// dat is precies de fout die de server alleen als "gespiegeld" kan raden.

const BREED = 320
const HOOG = 132
const MARGE_X = 26
const MARGE_Y = 22

export function Kalibratiekaartje({
  gezet,
  volgende,
  onKies,
}: {
  /** Per label: op welk beeld het gezet is (of niets). */
  gezet: Map<string, number>
  /** Het punt dat nu aan de beurt is. */
  volgende: string | null
  onKies: (label: string) => void
}) {
  const binnenB = BREED - 2 * MARGE_X
  const binnenH = HOOG - 2 * MARGE_Y
  // De zeven dwarslijnen liggen op vaste verhoudingen over de lengte: achterlijn, doellijn,
  // vrijeworplijn, middellijn en spiegelbeeld. Met een doelgebied van 10 m en een speelveld van
  // 26 m is dat 0 / 10 / 14 / 23 / 32 / 36 / 46 van de 46 meter.
  const xVan = [0, 10, 14, 23, 32, 36, 46].map((m) => MARGE_X + (m / 46) * binnenB)

  return (
    <div className="kk">
      <svg viewBox={`0 0 ${BREED} ${HOOG}`} className="kk-svg" role="img" aria-label="Veldkaartje met de veertien kruisingen">
        {/* Het speelvlak */}
        <rect x={MARGE_X} y={MARGE_Y} width={binnenB} height={binnenH} className="kk-veld" />
        {/* De doelgebieden, zodat je ziet welke lijn welke is */}
        <rect x={xVan[0]} y={MARGE_Y} width={xVan[1] - xVan[0]} height={binnenH} className="kk-doelgebied" />
        <rect x={xVan[5]} y={MARGE_Y} width={xVan[6] - xVan[5]} height={binnenH} className="kk-doelgebied" />
        {/* De zeven dwarslijnen */}
        {xVan.map((x, i) => (
          <line key={i} x1={x} y1={MARGE_Y} x2={x} y2={MARGE_Y + binnenH} className={`kk-lijn${i === 3 ? ' midden' : ''}`} />
        ))}

        {/* De veertien kruisingen. Boven = zijlijn links, onder = zijlijn rechts. */}
        {DWARSLIJNEN.map((lijn, i) =>
          ZIJDEN.map((z) => {
            const label = labelVan(lijn.sleutel, z as Zijde)
            const cx = xVan[i]
            const cy = z === 'links' ? MARGE_Y : MARGE_Y + binnenH
            const staat = gezet.has(label) ? 'gezet' : 'leeg'
            const nu = volgende === label
            return (
              <g key={label} onClick={() => onKies(label)} className="kk-punt-groep">
                {nu && <circle cx={cx} cy={cy} r={9} className="kk-halo" />}
                <circle cx={cx} cy={cy} r={5} className={`kk-punt ${staat}${nu ? ' nu' : ''}`}>
                  <title>{omschrijving(lijn, z as Zijde)}</title>
                </circle>
              </g>
            )
          }),
        )}

        <text x={MARGE_X} y={12} className="kk-tekst">← thuiskant</text>
        <text x={BREED - MARGE_X} y={12} className="kk-tekst rechts">uitkant →</text>
        <text x={BREED / 2} y={HOOG - 5} className="kk-tekst midden">zijlijn rechts</text>
        <text x={BREED / 2} y={MARGE_Y - 7} className="kk-tekst midden">zijlijn links</text>
      </svg>
      <p className="kk-uitleg">
        Links en rechts zijn afgesproken vanaf de <strong>achterlijn aan de thuiskant, kijkend naar
        de uitkant</strong> — sta je daar, dan wijst je linkerhand naar boven op dit kaartje. Tik
        een punt aan om het te (her)zetten.
      </p>
    </div>
  )
}
