'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// ── Gedeelde offline-wachtrij voor aantekenaar-acties (ROADMAP 1b) ────────────────────────────
// Acties die niet verzonden raken (geen internet) worden lokaal bewaard (localStorage, overleeft
// een refresh) en automatisch nagestuurd zodra de verbinding terug is — in volgorde, met per actie
// een vaste opId zodat de server een heruitgezonden actie niet dubbel toepast (processed-ops).
// Eén implementatie voor beide aantekenmodi: de snelscoremodus (SimpleScorekeeper) en het
// veldschema (Scorekeeper) delen dezelfde wachtrijsleutel per wedstrijd, zodat een gequeuede
// actie ook nagestuurd wordt als de aantekenaar intussen van modus wisselde.

export type SendResult =
  | { status: 'ok'; data: unknown }
  | { status: 'queued' }
  | { status: 'error'; message: string }

export function useActionQueue(matchId: number, onResponse: (data: unknown) => void) {
  const ACTION_URL = `/api/match/${matchId}/action`
  const QKEY = `kb-actionqueue-${matchId}`
  const queueRef = useRef<Record<string, unknown>[]>([])
  const flushing = useRef(false)
  // Loopt er een directe verzending? Ook gebruikt door de aanroeper om SSE-updates te negeren
  // terwijl een eigen actie onderweg is (geen optimistische schrijf overschrijven).
  const busyRef = useRef(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [offline, setOffline] = useState(false)
  // Callback in een ref zodat flush/send stabiel blijven, ook als de aanroeper per render een
  // nieuwe closure meegeeft.
  const onResponseRef = useRef(onResponse)
  onResponseRef.current = onResponse

  const persistQueue = useCallback(() => {
    try {
      localStorage.setItem(QKEY, JSON.stringify(queueRef.current))
    } catch {}
    setPendingCount(queueRef.current.length)
  }, [QKEY])

  const flush = useCallback(async () => {
    if (flushing.current) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setOffline(queueRef.current.length > 0)
      return
    }
    flushing.current = true
    try {
      while (queueRef.current.length) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) break
        const body = queueRef.current[0]
        let res: Response
        try {
          res = await fetch(ACTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        } catch {
          break // nog steeds offline → later opnieuw proberen
        }
        // Verstuurd (ook al weigert de server de actie): uit de wachtrij halen.
        queueRef.current.shift()
        persistQueue()
        try {
          const data = (await res.json()) as unknown
          if (res.ok) onResponseRef.current(data)
        } catch {}
      }
      setOffline(queueRef.current.length > 0)
    } finally {
      flushing.current = false
    }
  }, [ACTION_URL, persistQueue])

  // Wachtrij laden + automatisch nasturen bij (her)verbinding of periodiek.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(QKEY)
      if (raw) queueRef.current = JSON.parse(raw) as Record<string, unknown>[]
    } catch {}
    setPendingCount(queueRef.current.length)
    void flush()
    const onOnline = () => void flush()
    const onOffline = () => setOffline(true)
    // Terug uit de slaapstand: niet tot de volgende ronde van acht seconden wachten. Wie zijn
    // telefoon bovenhaalt om de volgende worp aan te tikken, hoort niet eerst naar een teller
    // met wachtende tikken te kijken.
    const onZichtbaar = () => {
      if (document.visibilityState === 'visible' && queueRef.current.length) void flush()
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onZichtbaar)
    const t = setInterval(() => {
      if (queueRef.current.length) void flush()
    }, 8000)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onZichtbaar)
      clearInterval(t)
    }
  }, [QKEY, flush])

  // Wegklikken met tikken die nog niet verstuurd zijn: dan waarschuwen. De wachtrij zelf
  // overleeft het (ze staat in localStorage en wordt bij het volgende bezoek van déze wedstrijd
  // nagestuurd), maar wie het tabblad sluit en niet terugkomt, weet anders niet dat er nog iets
  // openstond. Een refresh is dus veilig; helemaal weggaan verdient een vraag.
  useEffect(() => {
    if (pendingCount === 0) return
    const vraag = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', vraag)
    return () => window.removeEventListener('beforeunload', vraag)
  }, [pendingCount])

  /** Verstuur één actie (met opId). Wachtrij actief, offline of al een actie onderweg → achteraan
   *  aansluiten (volgorde behouden) i.p.v. de tik te verliezen. Een netwerkfout tijdens het
   *  versturen queuet alsnog; enkel een échte server-weigering komt als foutmelding terug. */
  const send = useCallback(
    async (op: Record<string, unknown>): Promise<SendResult> => {
      if (queueRef.current.length || busyRef.current || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        queueRef.current.push(op)
        persistQueue()
        void flush()
        return { status: 'queued' }
      }
      busyRef.current = true
      try {
        const res = await fetch(ACTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(op) })
        const data = (await res.json()) as { error?: string }
        if (!res.ok) return { status: 'error', message: data.error ?? 'Actie mislukt.' }
        onResponseRef.current(data)
        setOffline(false)
        return { status: 'ok', data }
      } catch (e) {
        // Netwerkfout (fetch gooit een TypeError) → bewaren en later nasturen. Al de rest
        // (bv. een onleesbaar antwoord) tonen we als fout.
        if (e instanceof TypeError) {
          queueRef.current.push(op)
          persistQueue()
          setOffline(true)
          return { status: 'queued' }
        }
        return { status: 'error', message: (e as Error).message }
      } finally {
        busyRef.current = false
        if (queueRef.current.length) void flush()
      }
    },
    [ACTION_URL, persistQueue, flush],
  )

  return { send, pendingCount, offline, busyRef }
}
