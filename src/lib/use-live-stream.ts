'use client'

import { useEffect, useRef, useState } from 'react'

import { HARTSLAG_MS, moetHerverbindenNaWake, verbindingDood } from './sse-leven'

// Gedeelde SSE-client met reconnect-backoff (AUDIT §2). De ingebouwde EventSource-reconnect
// kent geen plafond en geen jitter → bij een Railway-recycle herverbinden alle schermen tegelijk
// (thundering herd) en tonen ze ondertussen een bevroren stand. Deze hook beheert de reconnect
// zelf (capped exponential backoff + jitter) en geeft een `connected`-vlag terug zodat passieve
// borden zichtbaar "verbinding verbroken" kunnen tonen.
//
// En hij overleeft een slapende gsm. Dat is geen luxe aan een aantekentafel: wie de telefoon
// even wegsteekt, verbreekt zijn verbinding — maar vaak zónder dat de browser een fout meldt.
// De socket blijft dan "open" terwijl er niets meer door komt, en het scherm toont een stand
// die niet meer klopt. Twee bewakers daartegen:
//
//   1. een WAAKHOND op de hartslag die de server elke 15 seconden stuurt: blijft het te lang
//      stil, dan is de verbinding dood en verbinden we opnieuw;
//   2. bij het TERUGKOMEN van een scherm (of wanneer het netwerk terug is) meteen opnieuw
//      verbinden in plaats van op de backoff te wachten.
//
// Opnieuw verbinden is meteen ook de herstelactie: de server stuurt bij het aansluiten de
// huidige stand mee (zie match-channel.ts), dus na het ontwaken staat het scherm weer juist.
export function useLiveStream<T>(
  url: string,
  onUpdate: (data: T) => void,
  // Extra named SSE-events op DEZELFDE verbinding (bv. 'viewers', 'reactions') — geen 2e socket.
  extraEvents?: Record<string, (data: unknown) => void>,
): { connected: boolean } {
  const [connected, setConnected] = useState(false)
  const cbRef = useRef(onUpdate)
  cbRef.current = onUpdate
  const extraRef = useRef(extraEvents)
  extraRef.current = extraEvents
  const extraNames = extraEvents ? Object.keys(extraEvents).sort().join(',') : ''

  useEffect(() => {
    let es: EventSource | null = null
    let stopped = false
    let delay = 1000
    let retry: ReturnType<typeof setTimeout> | null = null
    // Wanneer hoorden we voor het laatst iets? Elk bericht telt, ook de hartslag.
    let laatste = Date.now()

    const gehoord = () => {
      laatste = Date.now()
      delay = 1000
      setConnected(true)
    }

    const connect = () => {
      if (stopped) return
      if (retry) {
        clearTimeout(retry)
        retry = null
      }
      es?.close()
      es = new EventSource(url)
      // De hartslag draagt geen inhoud; hij bewijst enkel dat de lijn nog leeft.
      es.addEventListener('ping', gehoord)
      es.addEventListener('update', (e) => {
        gehoord()
        try {
          cbRef.current(JSON.parse((e as MessageEvent).data) as T)
        } catch {
          /* corrupte frame negeren */
        }
      })
      for (const name of extraNames ? extraNames.split(',') : []) {
        es.addEventListener(name, (e) => {
          gehoord()
          try {
            extraRef.current?.[name]?.(JSON.parse((e as MessageEvent).data))
          } catch {
            /* negeer */
          }
        })
      }
      es.onopen = gehoord
      es.onerror = () => {
        setConnected(false)
        es?.close()
        if (stopped) return
        retry = setTimeout(connect, delay)
        delay = Math.min(delay * 2, 15000) + Math.floor(Math.random() * 500)
      }
    }

    connect()

    // De waakhond: een verbinding die stil valt zónder foutmelding is precies wat een slapende
    // gsm achterlaat.
    const waakhond = setInterval(() => {
      if (stopped || document.visibilityState !== 'visible') return
      if (verbindingDood(laatste, Date.now())) {
        setConnected(false)
        connect()
      }
    }, HARTSLAG_MS)

    const opWakker = () => {
      if (document.visibilityState !== 'visible') return
      if (moetHerverbindenNaWake(laatste, Date.now())) connect()
    }
    const opNetwerk = () => connect()
    document.addEventListener('visibilitychange', opWakker)
    window.addEventListener('online', opNetwerk)

    return () => {
      stopped = true
      es?.close()
      if (retry) clearTimeout(retry)
      clearInterval(waakhond)
      document.removeEventListener('visibilitychange', opWakker)
      window.removeEventListener('online', opNetwerk)
    }
  }, [url, extraNames])

  return { connected }
}

/**
 * Stabiel per-browser kijker-id (gedeeld over tabbladen via localStorage), zodat de
 * kijkersteller personen telt en niet elke open tab/verbinding apart.
 */
export function useViewerId(): string {
  const [id] = useState(() => {
    if (typeof window === 'undefined') return ''
    try {
      const key = 'kl-viewer-id'
      const existing = window.localStorage.getItem(key)
      if (existing) return existing
      const fresh = Math.random().toString(36).slice(2, 12)
      window.localStorage.setItem(key, fresh)
      return fresh
    } catch {
      return Math.random().toString(36).slice(2, 12)
    }
  })
  return id
}

/** Punten uit een doelpunt-label ("Doelpunt +2 …") halen. */
export function goalPointsFromLabel(label: string): number {
  const m = label.match(/\+(\d+)/)
  return m ? Number(m[1]) : 1
}

/** Scorernaam uit een doelpunt-label halen ("Doelpunt +2 Jan" → "Jan"). */
export function goalScorerFromLabel(label: string): string | null {
  return label.replace(/^Doelpunt\s*\+\d+\s*/, '').trim() || null
}
