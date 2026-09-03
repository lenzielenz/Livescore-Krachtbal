'use client'

// Brug naar de externe Google Cast Sender-SDK, die geen TypeScript-types meelevert.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useRef, useState } from 'react'

import { CAST_APP_ID, CAST_NAMESPACE } from '@/lib/cast'

// Casten naar een Chromecast, als herbruikbare haak.
//
// Dit zat vastgeklonken in de cast-bedieningspagina. Dat was goed genoeg zolang je van dáár uit
// casttte, maar niet voor wat mensen eigenlijk doen: het kantinescherm openen en het van dáár naar
// de tv willen sturen. Twee kopieën van deze SDK-dans is vragen om er eentje te vergeten wanneer
// er iets verandert; vandaar één plek.
//
// Wat er over de lijn gaat is géén videostroom maar een PAD ("/kantine/scherm"). De Chromecast
// draait onze eigen ontvanger (/cast-tv) en laadt dat pad zelf. Dat is bewust: de tv houdt zijn
// eigen live verbinding en blijft doorlopen ook als je je telefoon wegsteekt of de app sluit —
// bij tabblad-spiegelen zou het scherm mee sterven met je browser.

const SENDER_SDK = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1'
/** Hoelang we de SDK de tijd geven voor we besluiten dat casten hier niet gaat. */
const GEDULD_MS = 4000

/**
 * - `niet-ingesteld` — geen App ID: casten bestaat in deze installatie niet.
 * - `laden` — de SDK is onderweg; nog niets tonen, anders knippert er een knop weg.
 * - `klaar` — casten kan.
 * - `onmogelijk` — deze browser of app kan niet casten (geïnstalleerde app, iPhone, Firefox).
 *
 * Het onderscheid tussen `laden` en `onmogelijk` bestaat omdat we in het tweede geval iets
 * zinnigs willen aanbieden in plaats van te verdwijnen — en dat mag pas als we het zéker weten.
 */
export type CastStand = 'niet-ingesteld' | 'laden' | 'klaar' | 'onmogelijk'

export type CastHaak = {
  /** Is casten hier mogelijk? (App ID ingesteld én de SDK klaar.) */
  klaar: boolean
  /** Fijnmaziger dan `klaar`: ook of we het nog niet weten of het zeker niet kan. */
  stand: CastStand
  /** Naam van de tv waarnaar we casten, of null. */
  apparaat: string | null
  /** Stuur dit pad naar de Chromecast (vraagt bij de eerste keer om een toestel). */
  cast: (pad: string) => void
  /** Stop de sessie. */
  stop: () => void
}

/**
 * @param sleutel Houdt sessies uit elkaar wanneer één pagina naar twee schermen kan casten
 *                (veldscherm ↔ kantinescherm). Zonder onderscheid zou de tweede knop de eerste tv
 *                overnemen.
 */
export function useCast(sleutel = 'standaard'): CastHaak {
  const [stand, setStand] = useState<CastStand>(CAST_APP_ID ? 'laden' : 'niet-ingesteld')
  const [apparaat, setApparaat] = useState<string | null>(null)
  const sessie = useRef<any | null>(null)

  useEffect(() => {
    if (!CAST_APP_ID) return
    let gestopt = false
    const zet = (s: CastStand) => !gestopt && setStand((oud) => (oud === 'klaar' ? oud : s))

    const init = () => {
      const chrome = (window as any).chrome
      if (!chrome?.cast) return
      const verzoek = new chrome.cast.SessionRequest(CAST_APP_ID)
      const config = new chrome.cast.ApiConfig(
        verzoek,
        () => {},
        () => {},
        chrome.cast.AutoJoinPolicy.PAGE_SCOPED,
      )
      chrome.cast.initialize(config, () => !gestopt && setStand('klaar'), () => zet('onmogelijk'))
    }

    ;(window as any).__onGCastApiAvailable = (ok: boolean) => (ok ? init() : zet('onmogelijk'))
    if ((window as any).chrome?.cast) init()
    else if (!document.querySelector(`script[src="${SENDER_SDK}"]`)) {
      const s = document.createElement('script')
      s.src = SENDER_SDK
      // Laadt het script niet (geen net, geblokkeerd), dan komt er nooit een antwoord.
      s.onerror = () => zet('onmogelijk')
      document.head.appendChild(s)
    }
    // In een geïnstalleerde app zwijgt de SDK gewoon: `chrome.cast` komt er nooit en er valt niets
    // op te wachten. Zonder deze klok blijft de stand eeuwig op `laden` staan en verdwijnt de knop
    // stilletjes — precies het gedrag dat we willen vervangen door een bruikbaar antwoord.
    const klok = setTimeout(() => zet('onmogelijk'), GEDULD_MS)
    return () => {
      gestopt = true
      clearTimeout(klok)
    }
  }, [])

  const cast = useCallback(
    (pad: string) => {
      const chrome = (window as any).chrome
      if (!chrome?.cast) return

      // Drie keer sturen, verspreid over enkele seconden. De ontvanger heeft even nodig om zijn
      // eigen SDK te laden; een bericht dat vóór die tijd aankomt, hoort niemand. Herhalen is
      // goedkoper dan een handdruk verzinnen, en het pad opnieuw zetten is onschadelijk.
      const stuur = (s: any) => {
        const doe = () => s.sendMessage(CAST_NAMESPACE, { path: pad }, () => {}, () => {})
        doe()
        setTimeout(doe, 1200)
        setTimeout(doe, 3000)
      }

      if (sessie.current) {
        stuur(sessie.current)
        return
      }

      chrome.cast.requestSession((s: any) => {
        sessie.current = s
        setApparaat(s.receiver?.friendlyName ?? 'Chromecast')
        s.addUpdateListener((leeft: boolean) => {
          const gestopt = s.status === chrome.cast.SessionStatus.STOPPED
          if ((!leeft || gestopt) && sessie.current === s) {
            sessie.current = null
            setApparaat(null)
          }
        })
        stuur(s)
      }, () => {})
    },
    // De sleutel houdt de haak per scherm apart; hij verandert niet tijdens het leven ervan.
    [sleutel],
  )

  const stop = useCallback(() => {
    const s = sessie.current
    if (s) s.stop(() => {}, () => {})
    sessie.current = null
    setApparaat(null)
  }, [])

  return { klaar: stand === 'klaar', stand, apparaat, cast, stop }
}
