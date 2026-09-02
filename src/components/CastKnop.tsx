'use client'

import { useCast } from './use-cast'

import './cast-knop.css'

// "Zet dit scherm op de tv." Eén knop, op de plek waar je hem nodig hebt.
//
// Wat er gebeurt is geen tabblad-spiegelen maar iets beters: de Chromecast krijgt het PAD van dit
// scherm en laadt het zelf. De tv houdt daardoor zijn eigen live verbinding en blijft doorlopen
// wanneer je je telefoon wegsteekt, de app sluit of naar huis rijdt — bij spiegelen zou het
// scherm meesterven met je browser.
//
// De knop verschijnt alleen wanneer casten ook echt kan: geen App ID ingesteld, of een browser
// zonder Cast (iPhone, Firefox), en hij blijft weg in plaats van een knop te tonen die niets doet.

export function CastKnop({
  pad,
  sleutel,
  label = '📺 Naar de tv',
  klasse = 'cast-knop',
}: {
  /** Het pad dat de Chromecast moet tonen, bv. "/kantine/scherm". */
  pad: string
  /** Houdt sessies uit elkaar als één pagina naar twee schermen kan casten. */
  sleutel?: string
  label?: string
  klasse?: string
}) {
  const { klaar, apparaat, cast, stop } = useCast(sleutel)

  if (!klaar) return null

  if (apparaat) {
    return (
      <button
        type="button"
        className={`${klasse} aan`}
        onClick={stop}
        title={`Casten naar ${apparaat} stoppen`}
      >
        ⏹ Stop casten<span className="cast-knop-tv">{apparaat}</span>
      </button>
    )
  }

  return (
    <button type="button" className={klasse} onClick={() => cast(pad)} title="Toon dit scherm op de tv">
      {label}
    </button>
  )
}
