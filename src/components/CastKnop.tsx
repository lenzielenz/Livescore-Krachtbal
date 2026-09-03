'use client'

import { useEffect, useState } from 'react'

import { castUitwijk, type Uitwijk } from '@/lib/cast-uitwijk'
import { useCast } from './use-cast'

import './cast-knop.css'

// "Zet dit scherm op de tv." Eén knop, op de plek waar je hem nodig hebt.
//
// Wat er gebeurt is geen tabblad-spiegelen maar iets beters: de Chromecast krijgt het PAD van dit
// scherm en laadt het zelf. De tv houdt daardoor zijn eigen live verbinding en blijft doorlopen
// wanneer je je telefoon wegsteekt, de app sluit of naar huis rijdt — bij spiegelen zou het
// scherm meesterven met je browser.
//
// En als casten hier níét kan? Dan verdween de knop vroeger. Dat leek netjes — geen knop die niets
// doet — maar het pakte precies verkeerd uit voor wie de app geïnstalleerd had: Android laat
// `chrome.cast` niet toe in een geïnstalleerde app, dus je installeert de app en verliest de knop.
// In dát geval tonen we nu de weg die wél bestaat (één tik naar Chrome, of de link kopiëren).
//
// Enkel in de geïnstalleerde app, met opzet. Op de tv zelf draait dit scherm in de ontvanger, en
// daar hoort geen enkele knop; die is nooit "standalone", dus die blijft schoon. Een gewone
// browser zonder Cast (Firefox) krijgt ook niets — daar heeft niemand om een tv gevraagd.

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
  const { stand, apparaat, cast, stop } = useCast(sleutel)
  const [uitwijk, setUitwijk] = useState<Uitwijk | null>(null)
  const [open, setOpen] = useState(false)
  const [gekopieerd, setGekopieerd] = useState(false)

  // Pas ná het mounten: op de server bestaan `navigator` en `location` niet.
  useEffect(() => {
    if (stand !== 'onmogelijk') return
    // `matchMedia` bestaat niet overal (oudere tv-browsers, testomgevingen); dan is dit gewoon
    // geen geïnstalleerde app en blijft alles bij het oude.
    let standalone = false
    try {
      standalone =
        window.matchMedia?.('(display-mode: standalone)').matches === true ||
        (navigator as unknown as { standalone?: boolean }).standalone === true
    } catch {
      standalone = false
    }
    if (!standalone) return
    setUitwijk(castUitwijk({ ua: navigator.userAgent, url: new URL(pad, window.location.origin).toString() }))
  }, [stand, pad])

  if (stand === 'klaar') {
    if (apparaat) {
      return (
        <button type="button" className={`${klasse} aan`} onClick={stop} title={`Casten naar ${apparaat} stoppen`}>
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

  if (!uitwijk) return null

  const kopieer = async () => {
    const url = new URL(pad, window.location.origin).toString()
    try {
      await navigator.clipboard.writeText(url)
      setGekopieerd(true)
      setTimeout(() => setGekopieerd(false), 2500)
    } catch {
      // Geen toegang tot het klembord (oudere browser, geweigerde toestemming): de link staat
      // hieronder voluit, dus ze blijft over te typen of te selecteren.
      setGekopieerd(false)
    }
  }

  return (
    <span className="cast-uitwijk-hoek">
      <button type="button" className={klasse} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {label}
      </button>
      {open && (
        <div className="cast-uitwijk" role="dialog" aria-label={uitwijk.titel}>
          <strong className="cast-uitwijk-titel">{uitwijk.titel}</strong>
          <p className="cast-uitwijk-uitleg">{uitwijk.uitleg}</p>
          <span className="cast-uitwijk-link">{new URL(pad, window.location.origin).toString()}</span>
          <span className="cast-uitwijk-knoppen">
            {uitwijk.browserUrl && (
              // Bewust een gewone link en geen router-navigatie: dit adres moet de app juist
              // verlaten.
              <a className="cast-knop" href={uitwijk.browserUrl} rel="noreferrer">
                {uitwijk.browserLabel}
              </a>
            )}
            <button type="button" className="cast-knop" onClick={() => void kopieer()}>
              {gekopieerd ? '✓ Gekopieerd' : '🔗 Kopieer link'}
            </button>
          </span>
        </div>
      )}
    </span>
  )
}
