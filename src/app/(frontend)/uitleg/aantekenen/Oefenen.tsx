'use client'

import { useState } from 'react'

import { AANTEKEN_STAPPEN, UITLEG_PDF_PAD, type UitlegStap } from '@/lib/aantekenen-uitleg'
import './uitleg.css'

// Leren aantekenen door het te dóen.
//
// Een handleiding lezen en dan aan de tornooitafel voor het eerst op de knoppen zoeken, is hoe
// je een wedstrijd verkeerd start. Hier staat naast elke stap een nagebouwd scherm waarin je
// exact die ene knop moet vinden en indrukken. Nagebouwd en niet met foto's: schermafbeeldingen
// verouderen stilletjes, deze knoppen dragen dezelfde teksten als de echte (zie
// `lib/aantekenen-uitleg.ts`) en vallen op als ze uit elkaar lopen.
//
// Er gebeurt niets echts: geen wedstrijd, geen server, niemand krijgt een melding. Dat staat er
// ook bij — anders durft niemand te oefenen.

/** De stand van het nagemaakte scherm; enkel om de oefening iets te laten doen. */
type Doos = { score: [number, number]; kruisjes: number; gestart: boolean; helft: number; gedaan: boolean }

const BEGIN: Doos = { score: [0, 0], kruisjes: 0, gestart: false, helft: 1, gedaan: false }

export function Oefenen() {
  const [i, setI] = useState(0)
  const [doos, setDoos] = useState<Doos>(BEGIN)
  const [gedaan, setGedaan] = useState<Set<number>>(new Set())
  const [misklik, setMisklik] = useState<string | null>(null)

  const stap: UitlegStap = AANTEKEN_STAPPEN[i]
  const laatste = i === AANTEKEN_STAPPEN.length - 1
  const klaar = stap.oefening.soort === 'lees' || gedaan.has(stap.nr)

  const volgende = () => {
    if (laatste) return
    setI((n) => n + 1)
    setMisklik(null)
  }

  /** Een tik in het nagebouwde scherm. Alleen de gevraagde knop brengt je verder. */
  const tik = (doel: string) => {
    // Het scherm reageert altijd — ook op een knop die nu niet gevraagd is. Anders voelt het
    // nagebouwde scherm dood aan en denk je dat er iets kapot is.
    setDoos((d) => {
      if (doel === 'klok-start') return { ...d, gestart: true }
      if (doel === 'score-nek') return { ...d, score: [d.score[0] + 1, d.score[1]] }
      if (doel === 'score-rug') return { ...d, score: [d.score[0] + 2, d.score[1]] }
      if (doel === 'score-uit-nek') return { ...d, score: [d.score[0], d.score[1] + 1] }
      if (doel === 'kruisje-plus') return { ...d, kruisjes: d.kruisjes + 1 }
      if (doel === 'kruisje-min') return { ...d, kruisjes: Math.max(0, d.kruisjes - 1) }
      if (doel === 'einde-helft') return { ...d, helft: 2 }
      if (doel === 'einde-wedstrijd') return { ...d, gedaan: true }
      return d
    })
    if (stap.oefening.soort === 'knop' && stap.oefening.doel === doel) {
      setGedaan((g) => new Set(g).add(stap.nr))
      setMisklik(null)
    } else if (stap.oefening.soort === 'knop') {
      setMisklik('Dat is een andere knop — zoek degene die hierboven staat.')
    }
  }

  const opnieuw = () => {
    setI(0)
    setDoos(BEGIN)
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
        <Namaak scherm={stap.scherm} doos={doos} onTik={tik} verwacht={stap.oefening.soort === 'knop' ? stap.oefening.doel : null} />
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
          <button type="button" className="va-btn primary" onClick={volgende} disabled={!klaar}>
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

/** De nagebouwde schermen. Zelfde teksten als de echte knoppen, bewust plat en klein. */
function Namaak({
  scherm,
  doos,
  onTik,
  verwacht,
}: {
  scherm: UitlegStap['scherm']
  doos: Doos
  onTik: (doel: string) => void
  verwacht: string | null
}) {
  // Het te zoeken knopje krijgt een rustige gloed. Niet meteen: wie het zelf vindt, onthoudt het.
  const wijs = (doel: string) => `nm-knop${verwacht === doel ? ' gevraagd' : ''}`

  if (scherm === 'inloggen') {
    return (
      <div className="nm nm-login">
        <div className="nm-titel">Krachtbal <span>Live</span></div>
        <div className="nm-veld">e-mailadres</div>
        <div className="nm-veld">wachtwoord</div>
        <button type="button" className={wijs('inloggen')} onClick={() => onTik('inloggen')}>Inloggen</button>
      </div>
    )
  }

  if (scherm === 'dagprogramma') {
    return (
      <div className="nm nm-dag">
        {[
          { t: '18:00', h: 'Avanti Lissewege', u: 'Sporting Brugge', veld: 'Veld 1', jouw: false },
          { t: '18:10', h: 'KBC Male', u: 'Avanti Lissewege', veld: 'Veld 2', jouw: true },
        ].map((m) => (
          <div key={m.t} className={`nm-rij${m.jouw ? ' jouw' : ''}`}>
            <span className="nm-uur">{m.t}</span>
            <span className="nm-ploegen">{m.h} – {m.u}</span>
            <span className="nm-veld">{m.veld}</span>
            <button
              type="button"
              className={m.jouw ? wijs('aantekenen') : 'nm-knop'}
              onClick={() => onTik(m.jouw ? 'aantekenen' : 'andere-wedstrijd')}
            >
              Aantekenen
            </button>
          </div>
        ))}
        <p className="nm-hint">De onderste is jouw wedstrijd.</p>
      </div>
    )
  }

  return (
    <div className="nm nm-tafel">
      <div className="nm-stand">
        <span>{doos.score[0]}</span>
        <button
          type="button"
          className={`${wijs('klok-start')} nm-klok`}
          onClick={() => onTik('klok-start')}
        >
          <b>{doos.gestart ? '00:07' : '00:00'}</b>
          <small>{doos.gedaan ? 'afgelopen' : doos.gestart ? `helft ${doos.helft} · tik om te pauzeren` : '▶ Tik om te starten'}</small>
        </button>
        <span>{doos.score[1]}</span>
      </div>

      <div className="nm-ploegvakken">
        <div className="nm-vak">
          <span className="nm-vaknaam">KBC Male</span>
          <button type="button" className={wijs('score-nek')} onClick={() => onTik('score-nek')}>+1 <small>nekworp</small></button>
          <button type="button" className={wijs('score-rug')} onClick={() => onTik('score-rug')}>+2 <small>rugworp</small></button>
          <span className="nm-tellerrij">
            ✖ Kruisjes
            <button type="button" className={wijs('kruisje-min')} onClick={() => onTik('kruisje-min')}>−</button>
            <b>{doos.kruisjes}</b>
            <button type="button" className={wijs('kruisje-plus')} onClick={() => onTik('kruisje-plus')}>+</button>
          </span>
        </div>
        <div className="nm-vak">
          <span className="nm-vaknaam">Avanti Lissewege</span>
          <button type="button" className={wijs('score-uit-nek')} onClick={() => onTik('score-uit-nek')}>+1 <small>nekworp</small></button>
          <button type="button" className="nm-knop" onClick={() => onTik('score-uit-rug')}>+2 <small>rugworp</small></button>
        </div>
      </div>

      <div className="nm-onder">
        <button type="button" className="nm-knop" onClick={() => onTik('ondoen')}>↶ Ondoen</button>
        {doos.helft === 1 ? (
          <button type="button" className={wijs('einde-helft')} onClick={() => onTik('einde-helft')}>⏭ Einde 1e helft → 2e</button>
        ) : (
          <button type="button" className={wijs('einde-wedstrijd')} onClick={() => onTik('einde-wedstrijd')}>⏹ Einde wedstrijd</button>
        )}
      </div>
      {doos.gedaan && <p className="nm-klaar">Eindstand vastgelegd. (In het echt kan je nog heropenen.)</p>}
    </div>
  )
}
