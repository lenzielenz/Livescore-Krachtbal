'use client'

import { useEffect, useState } from 'react'

import { namen } from '@/lib/virtueel-aanwezig'

// Vóór je het stadion binnenstapt: hoeveel supporters van je club er nu al rondlopen, live. Een
// lege tribune lokt niemand; "Jan, Els en 3 anderen zijn al binnen" wel. De lijst komt van dezelfde
// gedeelde stroom als in het stadion zelf (één poller per club, enkel voor leden van die club).

type Lijst = { id: string; naam: string }[]

export function BinnenTeller({ clubNaam, ikId, begin }: { clubNaam: string; ikId: string; begin: string[] }) {
  const [binnen, setBinnen] = useState<string[]>(begin)
  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const es = new EventSource('/api/virtueel/aanwezig/stream')
    es.addEventListener('aanwezig', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent<string>).data) as Lijst | { aanwezig: Lijst }
        const lijst = Array.isArray(data) ? data : data.aanwezig
        const nieuw = lijst.filter((a) => a.id !== ikId).map((a) => a.naam)
        // De stroom komt bij elke stap van iemand; enkel bijwerken als er iemand bij komt of weggaat.
        setBinnen((oud) => (oud.join('|') === nieuw.join('|') ? oud : nieuw))
      } catch {
        // Een kapot bericht: het vorige getal blijft staan.
      }
    })
    return () => es.close()
  }, [ikId])

  const n = binnen.length
  return (
    <span className={`vk-binnen${n ? ' vol' : ''}`} aria-live="polite">
      <i aria-hidden />
      {n === 0 ? (
        <span>Nog niemand van {clubNaam} binnen — wees de eerste!</span>
      ) : (
        <span>
          <b>{`${n} ${n === 1 ? 'supporter' : 'supporters'}`}</b> van {clubNaam} {n === 1 ? 'is' : 'zijn'} nu binnen: {namen([...binnen].sort((a, b) => a.localeCompare(b)))}
        </span>
      )}
    </span>
  )
}
