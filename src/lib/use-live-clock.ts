'use client'

import { useEffect, useRef, useState } from 'react'

// Eén bron van waarheid voor "de klok lokaal laten doortikken tussen server-updates" — voorheen
// stond dit zes keer bijna letterlijk gekopieerd (LiveClock, Scoreboard, FieldScreen, Scorekeeper,
// SimpleScorekeeper, KantineBoard), elke keer met een vast setInterval(fn, 250).
//
// Dat vaste interval is de bron van de "seconde slaat over"-hik: het tikt om de 250ms, los van
// waar de échte secondegrens ligt. Wanneer de hoofdthread net iets te druk is (een SSE-payload,
// een her-render van de rest van het scherm, ...) en een tik te laat komt, is de volgende meting
// zomaar 300-500ms verder dan gepland — de tussenliggende secondegrens wordt dan nooit als eigen
// waarde weergegeven, ze wordt overgeslagen. De klok zelf loopt intussen wél correct (elke meting
// leest gewoon Date.now() opnieuw af), enkel de weergave hikt.
//
// Deze versie plant elke volgende tik precies op de volgende secondegrens i.p.v. blind te pollen:
// zelfcorrigerend (een late tik hoopt niets op — de volgende meet gewoon opnieuw vanaf Date.now()),
// en treft de grens zelf i.p.v. te hopen dat een vast interval er toevallig net voorbij valt.
export type LiveClockInput = {
  /** Laatst gekende stand in seconden. */
  seconds: number
  /** Loopt de klok? Staat ze stil, dan tikt er niets door — `seconds` is dan meteen het antwoord. */
  running: boolean
  /** Serverzijdig tijdstip waarop `seconds` gold (ISO) — zodat de tijd na een refresh klopt i.p.v.
   * terug naar nul te vallen. Ontbreekt dit (bv. tornooien houden geen updatedAt bij), dan geldt het
   * moment waarop deze waarden hier binnenkwamen als basis. */
  updatedAt?: string | null
  /** Optionele bovengrens (seconden) tegen een weggelopen klok — zie MAX_CLOCK_SECONDS in
   * Scorekeeper.tsx: een lang offline toestel mag na een reconnect niet een absurd hoog getal
   * tonen (of erger, terugschrijven naar de server). */
  max?: number
}

function computeNow(base: { seconds: number; at: number }, running: boolean, max?: number): number {
  const raw = running ? base.seconds + Math.max(0, (Date.now() - base.at) / 1000) : base.seconds
  return max != null ? Math.max(0, Math.min(max, raw)) : Math.max(0, raw)
}

/** Laat een wedstrijdklok lokaal doortikken tussen server-updates — stabiel, zonder de "seconde
 * overslaat"-hik van een vast interval (zie boven). */
export function useLiveClock({ seconds, running, updatedAt, max }: LiveClockInput): number {
  const baseRef = useRef({ seconds, at: updatedAt ? new Date(updatedAt).getTime() : Date.now() })
  const [now, setNow] = useState(() => computeNow(baseRef.current, running, max))

  useEffect(() => {
    baseRef.current = { seconds, at: updatedAt ? new Date(updatedAt).getTime() : Date.now() }
    setNow(computeNow(baseRef.current, running, max))
  }, [seconds, running, updatedAt])

  useEffect(() => {
    if (!running) return
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const virtual = computeNow(baseRef.current, running, max)
      setNow(virtual)
      // Plan de volgende tik op de volgende hele secondegrens van de virtuele klok — niet op de
      // muurklok: die twee liggen zelden gelijk (de basis start meestal niet exact op :000ms).
      const msIntoSecond = (virtual * 1000) % 1000
      timer = setTimeout(tick, Math.max(16, 1000 - msIntoSecond))
    }
    tick()
    return () => clearTimeout(timer)
  }, [running])

  return now
}

/** mm:ss, geklemd op nul — dezelfde opmaak overal waar een klok getoond wordt. */
export function fmtClock(total: number): string {
  const s = Math.max(0, Math.floor(total))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
