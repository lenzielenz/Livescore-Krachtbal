'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// ── Gedeelde offline-wachtrij voor aantekenaar-acties (ROADMAP 1b) ────────────────────────────
// Elke tik gaat door ÉÉN wachtrij (localStorage, overleeft een refresh) en wordt in volgorde
// verstuurd, met een vaste opId zodat de server een heruitgezonden actie niet dubbel toepast
// (processed-ops). Eén implementatie voor beide aantekenmodi (SimpleScorekeeper en Scorekeeper).
//
// Wat er nooit meer mag gebeuren (faalanalyse wedstrijddag):
// - een tik die stil verdwijnt: een serverfout (5xx, uitrol, time-out) houdt de tik in de wachtrij
//   en probeert later opnieuw; een echte weigering (4xx) komt in `geweigerd` en het scherm toont ze
//   met "opnieuw" of "weggooien";
// - een omgekeerde volgorde: er is maar één verzender, nooit een directe verzending naast een
//   lopende wachtrij;
// - een verzoek dat eindeloos hangt op een slechte lijn: na TIME_OUT_MS breken we af en proberen
//   later opnieuw (de opId maakt dat veilig, ook als de server het eerste verzoek wél verwerkte);
// - tikken van een toestel dat uren later terug opstart en een wedstrijd "inhaalt" die intussen op
//   een ander toestel verder aangetekend werd: een oude wachtrij wordt pas verstuurd na bevestiging.
// Elke tik draagt ook het moment van het toestel (`at`), zodat de server klok en minuut van een
// offline gezette actie juist kan rekenen.

export type SendResult =
  | { status: 'ok'; data: unknown }
  | { status: 'queued' }
  | { status: 'error'; message: string }

export type QueueOp = Record<string, unknown> & { opId?: string; at?: number }
export type GeweigerdeTik = { op: QueueOp; melding: string }

const TIME_OUT_MS = 8000
/** Ouder dan dit bij het openen: eerst vragen of de tikken nog verstuurd moeten worden. */
const OUD_MS = 15 * 60 * 1000

const genId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`

/** Een antwoord dat later opnieuw kan lukken (server stuk, uitrol, overbelast, time-out). */
const tijdelijk = (status: number) => status >= 500 || status === 408 || status === 429

export function useActionQueue(matchId: number, onResponse: (data: unknown) => void) {
  const ACTION_URL = `/api/match/${matchId}/action`
  const QKEY = `kb-actionqueue-${matchId}`
  const queueRef = useRef<QueueOp[]>([])
  const flushing = useRef(false)
  // Wie wacht er op welke tik (de knop die net ingedrukt werd)?
  const wachters = useRef(new Map<string, (r: SendResult) => void>())
  const [pendingCount, setPendingCount] = useState(0)
  const [offline, setOffline] = useState(false)
  const [geweigerd, setGeweigerd] = useState<GeweigerdeTik[]>([])
  // Een wachtrij van een vorige sessie die al oud is: niet vanzelf versturen.
  const [oudeWachtrij, setOudeWachtrij] = useState<{ aantal: number; sinds: number } | null>(null)
  const oudVast = useRef(false)
  const onResponseRef = useRef(onResponse)
  onResponseRef.current = onResponse

  // "Bezig" voor de aanroeper: zolang er iets onderweg is of in de wachtrij staat, mag een
  // SSE-update de optimistische stand niet terugzetten (anders tikt men een doelpunt dubbel).
  const busyRef = useRef<{ readonly current: boolean }>({
    get current() {
      return flushing.current || queueRef.current.length > 0
    },
  }).current

  const persistQueue = useCallback(() => {
    try {
      localStorage.setItem(QKEY, JSON.stringify(queueRef.current))
    } catch {}
    setPendingCount(queueRef.current.length)
  }, [QKEY])

  const losLaten = (opId: string | undefined, r: SendResult) => {
    if (!opId) return false
    const w = wachters.current.get(opId)
    if (!w) return false
    wachters.current.delete(opId)
    w(r)
    return true
  }

  const flush = useCallback(async () => {
    if (flushing.current || oudVast.current) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setOffline(queueRef.current.length > 0)
      for (const op of queueRef.current) losLaten(op.opId, { status: 'queued' })
      return
    }
    flushing.current = true
    try {
      while (queueRef.current.length) {
        const op = queueRef.current[0]
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), TIME_OUT_MS)
        let res: Response | null = null
        try {
          res = await fetch(ACTION_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(op),
            signal: ctrl.signal,
          })
        } catch {
          res = null // geen netwerk of time-out
        } finally {
          clearTimeout(timer)
        }
        if (!res || tijdelijk(res.status)) {
          // Later opnieuw (8 s-ronde, terug online, scherm terug zichtbaar). Wie wacht, hoort dat
          // de tik bewaard is.
          setOffline(true)
          for (const o of queueRef.current) losLaten(o.opId, { status: 'queued' })
          break
        }
        queueRef.current.shift()
        persistQueue()
        let data: { error?: string } | null = null
        try {
          data = (await res.json()) as { error?: string }
        } catch {}
        if (res.ok) {
          onResponseRef.current(data)
          losLaten(op.opId, { status: 'ok', data })
        } else {
          const melding = data?.error ?? `Geweigerd (${res.status}).`
          // Wacht de knop er nog op, dan toont die de fout zelf; anders (een tik van daarnet die
          // offline bewaard werd) komt ze in de lijst "niet verwerkt".
          if (!losLaten(op.opId, { status: 'error', message: melding })) {
            setGeweigerd((g) => [...g, { op, melding }])
          }
        }
        setOffline(false)
      }
      if (!queueRef.current.length) setOffline(false)
    } finally {
      flushing.current = false
    }
  }, [ACTION_URL, persistQueue])

  // Wachtrij laden + automatisch nasturen bij (her)verbinding of periodiek.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(QKEY)
      if (raw) queueRef.current = JSON.parse(raw) as QueueOp[]
    } catch {}
    setPendingCount(queueRef.current.length)
    // Een tik zonder `at` (van een oudere versie van de app) tellen we niet als oud.
    const oudste = queueRef.current.reduce((m, o) => Math.min(m, typeof o.at === 'number' ? o.at : Date.now()), Date.now())
    if (queueRef.current.length && Date.now() - oudste > OUD_MS) {
      oudVast.current = true
      setOudeWachtrij({ aantal: queueRef.current.length, sinds: oudste })
    } else void flush()
    const onOnline = () => void flush()
    const onOffline = () => setOffline(true)
    // Terug uit de slaapstand: niet tot de volgende ronde wachten.
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

  // Hartslag: "dit toestel tekent nog aan". Zonder tikken (een rustige fase) zou de wedstrijd anders
  // na 3 minuten overgenomen kunnen worden (zie overneemWeigering in score-trust.ts). Gaat niet
  // door de wachtrij: een gemiste hartslag hoeft niet nagestuurd te worden.
  useEffect(() => {
    const klop = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return
      void fetch(ACTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'aanwezig' }),
      }).catch(() => {})
    }
    klop()
    const t = setInterval(klop, 60_000)
    return () => clearInterval(t)
  }, [ACTION_URL])

  // Wegklikken met tikken die nog niet verstuurd zijn: dan waarschuwen. Een refresh is veilig (de
  // wachtrij staat in localStorage); helemaal weggaan verdient een vraag.
  useEffect(() => {
    if (pendingCount === 0) return
    const vraag = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', vraag)
    return () => window.removeEventListener('beforeunload', vraag)
  }, [pendingCount])

  /** Verstuur één actie. Altijd via de wachtrij: in volgorde, en nooit verloren. */
  const send = useCallback(
    (op: QueueOp): Promise<SendResult> => {
      const volledig: QueueOp = { ...op, opId: typeof op.opId === 'string' ? op.opId : genId(), at: typeof op.at === 'number' ? op.at : Date.now() }
      queueRef.current.push(volledig)
      persistQueue()
      const p = new Promise<SendResult>((resolve) => wachters.current.set(volledig.opId as string, resolve))
      if (oudVast.current) losLaten(volledig.opId, { status: 'queued' })
      else void flush()
      return p
    },
    [persistQueue, flush],
  )

  /** Een geweigerde tik opnieuw proberen (bv. na de vrijgave van de scheidsrechter). */
  const opnieuw = useCallback(
    (opId: string) => {
      setGeweigerd((g) => {
        const t = g.find((x) => x.op.opId === opId)
        if (t) {
          queueRef.current.push(t.op)
          persistQueue()
          void flush()
        }
        return g.filter((x) => x.op.opId !== opId)
      })
    },
    [persistQueue, flush],
  )
  const weggooien = useCallback((opId: string) => setGeweigerd((g) => g.filter((x) => x.op.opId !== opId)), [])

  /** Oude wachtrij (vorige sessie): toch versturen, of weggooien. */
  const oudeVersturen = useCallback(() => {
    oudVast.current = false
    setOudeWachtrij(null)
    void flush()
  }, [flush])
  const oudeWeggooien = useCallback(() => {
    oudVast.current = false
    queueRef.current = []
    persistQueue()
    setOudeWachtrij(null)
  }, [persistQueue])

  return { send, pendingCount, offline, busyRef, geweigerd, opnieuw, weggooien, oudeWachtrij, oudeVersturen, oudeWeggooien }
}
