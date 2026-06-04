'use client'

import { useEffect, useRef, useState } from 'react'

// Gedeelde SSE-client met reconnect-backoff (AUDIT §2). De ingebouwde EventSource-reconnect
// kent geen plafond en geen jitter → bij een Railway-recycle herverbinden alle schermen tegelijk
// (thundering herd) en tonen ze ondertussen een bevroren stand. Deze hook beheert de reconnect
// zelf (capped exponential backoff + jitter) en geeft een `connected`-vlag terug zodat passieve
// borden zichtbaar "verbinding verbroken" kunnen tonen.
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

    const connect = () => {
      es = new EventSource(url)
      es.addEventListener('update', (e) => {
        delay = 1000
        setConnected(true)
        try {
          cbRef.current(JSON.parse((e as MessageEvent).data) as T)
        } catch {
          /* corrupte frame negeren */
        }
      })
      for (const name of extraNames ? extraNames.split(',') : []) {
        es.addEventListener(name, (e) => {
          try {
            extraRef.current?.[name]?.(JSON.parse((e as MessageEvent).data))
          } catch {
            /* negeer */
          }
        })
      }
      es.onopen = () => {
        delay = 1000
        setConnected(true)
      }
      es.onerror = () => {
        setConnected(false)
        es?.close()
        if (stopped) return
        retry = setTimeout(connect, delay)
        delay = Math.min(delay * 2, 15000) + Math.floor(Math.random() * 500)
      }
    }

    connect()
    return () => {
      stopped = true
      es?.close()
      if (retry) clearTimeout(retry)
    }
  }, [url, extraNames])

  return { connected }
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
