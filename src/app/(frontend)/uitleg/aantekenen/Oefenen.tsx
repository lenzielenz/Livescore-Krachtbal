'use client'

import { useEffect, useState } from 'react'

import {
  beginstandVoor,
  inRust,
  knopBeschikbaar,
  naTik,
  type OefenStand,
} from '@/lib/aantekenen-oefening'
import { AANTEKEN_STAPPEN, UITLEG_PDF_PAD, type UitlegStap } from '@/lib/aantekenen-uitleg'
import './uitleg.css'

// Leren aantekenen door het te dóen.
//
// Een handleiding lezen en dan aan de tornooitafel voor het eerst op de knoppen zoeken, is hoe je
// een wedstrijd verkeerd start. Hier staat naast elke stap een nagebouwd scherm waarin je exact
// die ene knop moet vinden en indrukken.
//
// Het scherm is nagebouwd en geen foto: een foto veroudert stilletjes, en je kan er niet op
// tikken. Maar het moet er wél uitzien als het echte — dezelfde volgorde, dezelfde kleuren,
// dezelfde teksten (zie `TournamentScoresheet`). Anders herken je aan de tafel niets terug.
//
// Elke stap begint bij zijn eigen beginstand (`beginstandVoor`). Dat is niet om het simpel te
// houden: wie in stap 6 al naar de tweede helft ging, vond in stap 7 de knop "2e helft" niet meer
// en kwam niet verder. Een oefening die kan doodlopen, leert niemand iets.
//
// En er gebeurt niets echts: geen wedstrijd, geen server, niemand krijgt een melding. Dat staat
// er ook bij — anders durft niemand te oefenen.

const PLOEGEN = ['KBC Male', 'Avanti Lissewege'] as const

export function Oefenen() {
  const [i, setI] = useState(0)
  const stap: UitlegStap = AANTEKEN_STAPPEN[i]
  const [stand, setStand] = useState<OefenStand>(() => beginstandVoor(stap.nr))
  const [gedaan, setGedaan] = useState<Set<number>>(new Set())
  const [misklik, setMisklik] = useState<string | null>(null)

  // Bij elke stap het scherm terugzetten naar de stand die bij die stap hoort.
  useEffect(() => {
    setStand(beginstandVoor(stap.nr))
    setMisklik(null)
  }, [stap.nr])

  const laatste = i === AANTEKEN_STAPPEN.length - 1
  const klaar = stap.oefening.soort === 'lees' || gedaan.has(stap.nr)

  /** Een tik in het nagebouwde scherm. Alleen de gevraagde knop brengt je verder. */
  const tik = (doel: string) => {
    // Het scherm reageert altijd — ook op een knop die nu niet gevraagd is. Anders voelt het
    // nagebouwde scherm dood aan en denk je dat er iets kapot is.
    setStand((s) => naTik(s, doel))
    if (stap.oefening.soort !== 'knop') return
    if (stap.oefening.doel === doel) {
      setGedaan((g) => new Set(g).add(stap.nr))
      setMisklik(null)
    } else {
      setMisklik('Dat is een andere knop — zoek degene die hierboven staat.')
    }
  }

  const opnieuw = () => {
    setI(0)
    setStand(beginstandVoor(1))
    setGedaan(new Set())
    setMisklik(null)
  }

  return (
    <div className="uit">
      <div className="uit-kop">
        <div className="uit-balk" aria-hidden>
          {AANTEKEN_STAPPEN.map((s) => (
            <span
              key={s.nr}
              className={`uit-bol${s.nr === stap.nr ? ' nu' : ''}${gedaan.has(s.nr) || s.nr < stap.nr ? ' klaar' : ''}`}
            />
          ))}
        </div>
        <span className="uit-teller">
          Stap {stap.nr} van {AANTEKEN_STAPPEN.length}
        </span>
      </div>

      <h2 className="uit-titel">
        <span aria-hidden>{stap.icoon}</span> {stap.titel}
      </h2>
      <p className="uit-tekst">{stap.tekst}</p>
      {stap.letOp && <p className="uit-letop">Let op — {stap.letOp}</p>}

      <div className="uit-scherm" aria-label="Nagebouwd scherm om te oefenen">
        <span className="uit-scherm-lbl">oefenscherm · hier gebeurt niets echt</span>
        <Namaak
          scherm={stap.scherm}
          stand={stand}
          onTik={tik}
          verwacht={stap.oefening.soort === 'knop' ? stap.oefening.doel : null}
        />
      </div>

      {misklik && <p className="uit-mis">{misklik}</p>}
      {stap.oefening.soort === 'knop' && klaar && <p className="uit-ok">Juist — dat is de knop.</p>}

      <div className="uit-acties">
        <button type="button" className="va-btn" onClick={() => setI((n) => Math.max(0, n - 1))} disabled={i === 0}>
          ‹ Vorige
        </button>
        {laatste ? (
          <button type="button" className="va-btn primary" onClick={opnieuw}>
            ↻ Nog eens oefenen
          </button>
        ) : (
          <button type="button" className="va-btn primary" onClick={() => setI((n) => n + 1)} disabled={!klaar}>
            {klaar ? 'Volgende ›' : 'Doe eerst de stap hierboven'}
          </button>
        )}
        <a className="va-btn" href={UITLEG_PDF_PAD} target="_blank" rel="noopener noreferrer">
          🖨 Handleiding afdrukken
        </a>
      </div>
    </div>
  )
}

/** Klok als mm:ss, zoals op de echte tafel. */
const mmss = (sec: number) =>
  `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

/** De nagebouwde schermen — zelfde volgorde, kleuren en teksten als de echte tornooitafel. */
function Namaak({
  scherm,
  stand,
  onTik,
  verwacht,
}: {
  scherm: UitlegStap['scherm']
  stand: OefenStand
  onTik: (doel: string) => void
  verwacht: string | null
}) {
  /** De knop die deze stap vraagt krijgt een rustige gloed — zichtbaar, maar je moet hem nog
   *  altijd zelf herkennen. */
  const wijs = (doel: string, extra = '') =>
    `nm-knop${extra ? ` ${extra}` : ''}${verwacht === doel ? ' gevraagd' : ''}`
  const rust = inRust(stand)

  if (scherm === 'inloggen') {
    return (
      <div className="nm nm-login">
        <div className="nm-titel">Krachtbal <span>Live</span></div>
        <div className="nm-veld">e-mailadres</div>
        <div className="nm-veld">wachtwoord</div>
        <button type="button" className={wijs('inloggen', 'nm-blauw')} onClick={() => onTik('inloggen')}>
          Inloggen
        </button>
      </div>
    )
  }

  if (scherm === 'dagprogramma') {
    // Nagebouwd naar de échte rij op het dagprogramma (Dagprogramma.tsx): uur, de affiche, en
    // daaronder één rustige metaregel met de status, het veld, de reeks en de speelduur. Stond
    // hier minder, dan beloofde de uitleg iets ("met het uur, het veld, de categorie en de
    // speelduur") wat het plaatje niet liet zien.
    return (
      <div className="nm nm-dag">
        {[
          { t: '18:00', h: 'Avanti Lissewege', u: 'Sporting Brugge', veld: 'Veld 1', reeks: 'U14', duur: 10, st: 'Te spelen', jouw: false },
          { t: '18:10', h: PLOEGEN[0], u: PLOEGEN[1], veld: 'Veld 2', reeks: 'U14', duur: 10, st: 'Te spelen', jouw: true },
        ].map((m) => (
          <div key={m.t} className={`nm-rij${m.jouw ? ' jouw' : ''}`}>
            <span className="nm-uur">{m.t}</span>
            <span className="nm-ploegen">{m.h} – {m.u}</span>
            <span className="nm-metarij">
              <span className="nm-tag">{m.st}</span>
              <span className="nm-tag veld">{m.veld}</span>
              <span className="nm-tag reeks">{m.reeks}</span>
              <span className="nm-tag">2×{m.duur}&#8242;</span>
              <button
                type="button"
                className={m.jouw ? wijs('aantekenen') : 'nm-knop'}
                onClick={() => onTik(m.jouw ? 'aantekenen' : 'andere-wedstrijd')}
              >
                Aantekenen
              </button>
            </span>
          </div>
        ))}
        <p className="nm-hint">De onderste is jouw wedstrijd.</p>
      </div>
    )
  }

  const status = stand.gedaan ? 'AFGELOPEN' : stand.gestart ? `LIVE · H${stand.helft}` : 'NOG NIET GESTART'

  return (
    <div className="nm nm-tafel">
      <div className="nm-meta">
        <span>{PLOEGEN[0]} – {PLOEGEN[1]}</span>
        <span className={`nm-status${stand.gestart && !stand.gedaan ? ' live' : ''}`}>{status}</span>
      </div>

      <div className={`nm-klok${rust ? ' rust' : ''}`}>
        <b>{mmss(stand.klok)}</b>
        <small>
          Helft {stand.helft} · doel 10 min
          {stand.gestart && !stand.gedaan
            ? rust
              ? ' · rust'
              : stand.klokLoopt
                ? ' · loopt'
                : ' · gepauzeerd'
            : ''}
        </small>
        {/* De rust uitleggen, precies zoals de echte tafel het doet: een klok op nul die niet
            loopt, ziet er anders uit als een fout. */}
        {rust && <em className="nm-rustlijn">Eerste helft afgesloten — de tweede moet nog beginnen.</em>}
      </div>

      <div className="nm-ploegvakken">
        {([0, 1] as const).map((p) => {
          const kant = p === 0 ? 'thuis' : 'uit'
          return (
            <div className="nm-vak" key={kant}>
              <span className="nm-vaknaam">{PLOEGEN[p]}</span>
              <span className="nm-score">{stand.score[p]}</span>
              {!stand.gedaan && (
                <span className="nm-goalrij">
                  <button
                    type="button"
                    className={wijs(`score-${kant}-nek`, 'nm-nek')}
                    onClick={() => onTik(`score-${kant}-nek`)}
                  >
                    +1 <small>nekworp</small>
                  </button>
                  <button
                    type="button"
                    className={wijs(`score-${kant}-rug`, 'nm-rug')}
                    onClick={() => onTik(`score-${kant}-rug`)}
                  >
                    +2 <small>rugworp</small>
                  </button>
                </span>
              )}
              <Teller
                label="✖ Kruisjes"
                waarde={stand.kruisjes[p]}
                doelMin={`kruisje-${kant}-min`}
                doelPlus={`kruisje-${kant}-plus`}
                uit={stand.gedaan}
                wijs={wijs}
                onTik={onTik}
              />
              <Teller
                label="⏱ Minuten"
                waarde={stand.minuten[p]}
                doelMin={`minuut-${kant}-min`}
                doelPlus={`minuut-${kant}-plus`}
                uit={stand.gedaan}
                wijs={wijs}
                onTik={onTik}
              />
            </div>
          )
        })}
      </div>

      {!stand.gedaan && (
        <div className="nm-onder">
          <button type="button" className={wijs('ondoen', 'nm-breed')} onClick={() => onTik('ondoen')} disabled={!stand.laatste}>
            {stand.laatste
              ? `↶ Ondoen: +${stand.laatste.punten} ${PLOEGEN[stand.laatste.ploeg]}`
              : '↶ Niets te ondoen'}
          </button>
          {/* Wélke knoppen er staan komt uit `knopBeschikbaar` — dezelfde bron als de test.
              Zou het scherm zijn eigen voorwaarden herhalen, dan kan het weer gebeuren dat een
              stap een knop vraagt die er niet is. */}
          {knopBeschikbaar(stand, 'start') && (
            <button type="button" className={wijs('start', 'nm-breed nm-blauw')} onClick={() => onTik('start')}>
              ▶ Start
            </button>
          )}
          {stand.gestart && (
            <span className="nm-rij2">
              {knopBeschikbaar(stand, 'pauze') && (
                <button type="button" className={wijs('pauze')} onClick={() => onTik('pauze')}>⏸ Pauze</button>
              )}
              {knopBeschikbaar(stand, 'klok') && (
                <button type="button" className={wijs('klok')} onClick={() => onTik('klok')}>▶ Klok</button>
              )}
              {/* In de rust heet de klokknop naar wát je start. Zo staat er nooit een kale
                  "Klok" op een scherm waar de tweede helft nog moet beginnen. */}
              {knopBeschikbaar(stand, 'start-helft') && (
                <button type="button" className={wijs('start-helft', 'nm-blauw')} onClick={() => onTik('start-helft')}>
                  ▶ Start 2e helft
                </button>
              )}
              {knopBeschikbaar(stand, 'einde-helft') && (
                <button type="button" className={wijs('einde-helft')} onClick={() => onTik('einde-helft')}>
                  ⏭ Einde 1e helft
                </button>
              )}
            </span>
          )}
          {knopBeschikbaar(stand, 'einde-wedstrijd') && (
            <button type="button" className={wijs('einde-wedstrijd', 'nm-breed nm-rood')} onClick={() => onTik('einde-wedstrijd')}>
              ⏹ Einde
            </button>
          )}
        </div>
      )}
      {stand.gedaan && <p className="nm-klaar">Eindstand vastgelegd. (In het echt kan je nog heropenen.)</p>}
    </div>
  )
}

function Teller({
  label,
  waarde,
  doelMin,
  doelPlus,
  uit,
  wijs,
  onTik,
}: {
  label: string
  waarde: number
  doelMin: string
  doelPlus: string
  uit: boolean
  wijs: (doel: string, extra?: string) => string
  onTik: (doel: string) => void
}) {
  return (
    <span className="nm-tellerrij">
      <i>{label}</i>
      {!uit && <button type="button" className={wijs(doelMin)} onClick={() => onTik(doelMin)}>−</button>}
      <b>{waarde}</b>
      {!uit && <button type="button" className={wijs(doelPlus)} onClick={() => onTik(doelPlus)}>+</button>}
    </span>
  )
}
