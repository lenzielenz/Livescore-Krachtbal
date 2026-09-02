'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { Ad } from '@/lib/ads'
import { kiesReclame, OVERLAY_MS, volgendeWachttijdMs } from '@/lib/reclame-overlay'
import { uitsnedeStijl } from '@/lib/reclame'

import './reclame.css'

// Af en toe neemt één reclame het scherm over: groot in beeld, een goede vijftien seconden, en
// weer weg.
//
// De belangrijkste regel staat in de opmaak, niet hier: de SCORE BLIJFT DOORSCHEMEREN. Het bord
// wordt gedimd, niet verborgen. Wie op dat moment net naar de stand keek, is ze niet kwijt — en
// dat is precies het verschil tussen "een sponsor in beeld" en "mijn scherm is weg".
//
// Het moment schommelt rond de tien minuten (zie lib/reclame-overlay.ts): op de klok wordt een
// patroon, en een patroon ga je verwachten en wegkijken.

export function ReclameOverlay({ ads }: { ads: Ad[] }) {
  const [nu, setNu] = useState<Ad | null>(null)
  const [sluitend, setSluitend] = useState(false)
  const vorige = useRef<number | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const opruimen = useCallback(() => {
    for (const t of timers.current) clearTimeout(t)
    timers.current = []
  }, [])

  useEffect(() => {
    if (ads.length === 0) return

    const plan = () => {
      const wacht = volgendeWachttijdMs()
      timers.current.push(
        setTimeout(() => {
          const keuze = kiesReclame(ads, vorige.current)
          if (!keuze) {
            plan()
            return
          }
          vorige.current = keuze.id
          setSluitend(false)
          setNu(keuze)
          // Eerst laten wegvagen, dán pas uit beeld halen — anders knalt de score terug.
          timers.current.push(setTimeout(() => setSluitend(true), OVERLAY_MS))
          timers.current.push(
            setTimeout(() => {
              setNu(null)
              plan()
            }, OVERLAY_MS + 600),
          )
        }, wacht),
      )
    }

    plan()
    return opruimen
    // Enkel opnieuw plannen wanneer de lijst reclames zelf verandert.
  }, [ads, opruimen])

  if (!nu) return null

  return (
    <div className={`ro${sluitend ? ' weg' : ''}`} role="presentation" aria-hidden>
      {/* Doorschijnend, niet dekkend: de score erachter blijft leesbaar. */}
      <div className="ro-waas" />
      <div className={`ro-kaart achter-${nu.achtergrond}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={nu.url} alt={nu.naam} draggable={false} style={uitsnedeStijl(nu.uitsnede)} />
      </div>
      <span className="ro-label">met steun van {nu.naam || 'onze sponsors'}</span>
    </div>
  )
}
