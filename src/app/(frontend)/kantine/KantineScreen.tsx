'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { Tile, type KantineMatch } from './KantineBoard'

// Layout die meeschaalt met het aantal getoonde borden: weinig wedstrijden = grote vakken die
// het scherm vullen, meer wedstrijden = meer kolommen en kleinere vakken.
function layoutFor(n: number): { cols: number; fontSize: number; logoSize: string } {
  if (n <= 1) return { cols: 1, fontSize: 34, logoSize: 'clamp(96px, 17vmin, 220px)' }
  if (n <= 2) return { cols: 2, fontSize: 28, logoSize: 'clamp(76px, 13vmin, 170px)' }
  if (n <= 4) return { cols: 2, fontSize: 23, logoSize: 'clamp(60px, 11vmin, 140px)' }
  if (n <= 6) return { cols: 3, fontSize: 19, logoSize: 'clamp(48px, 8vmin, 108px)' }
  if (n <= 9) return { cols: 3, fontSize: 17, logoSize: 'clamp(42px, 7vmin, 92px)' }
  if (n <= 12) return { cols: 4, fontSize: 15, logoSize: 'clamp(34px, 5.5vmin, 76px)' }
  return { cols: 5, fontSize: 13, logoSize: 'clamp(28px, 4.5vmin, 64px)' }
}

// Het eigenlijke kantinescherm (kantine-tv): toont de centraal gekozen wedstrijden als live
// borden. Pollt de selectie elke 12s zodat wijzigingen op een ander toestel vanzelf doorkomen;
// de scores binnen elk bord lopen live via SSE. De layout past zich aan aan het aantal borden.
export function KantineScreen() {
  const [matches, setMatches] = useState<KantineMatch[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const r = await fetch('/api/kantine', { cache: 'no-store' })
        if (!r.ok) return
        const d = (await r.json()) as { matches?: KantineMatch[] }
        if (active) {
          setMatches(d.matches ?? [])
          setLoaded(true)
        }
      } catch {
        /* netwerkfout — volgende poll probeert opnieuw */
      }
    }
    void load()
    const t = setInterval(load, 12000)
    return () => {
      active = false
      clearInterval(t)
    }
  }, [])

  // Toon de gespeelde wedstrijden (live + afgelopen): een afgelopen wedstrijd blijft staan, en
  // zodra een geplande wedstrijd start komt ze er vanzelf bij. Zolang er nog niets begonnen is,
  // tonen we de geplande wedstrijden (anders zou het scherm leeg zijn vóór de aftrap).
  const played = matches.filter((m) => m.status !== 'scheduled')
  const visible = played.length > 0 ? played : matches
  const { cols, fontSize, logoSize } = layoutFor(visible.length)

  return (
    <div className="kt-screen">
      <Link href="/kantine" className="kt-screen-edit">‹ Aanpassen</Link>
      {loaded && matches.length === 0 ? (
        <div className="kt-screen-empty">
          <p>Nog geen wedstrijden gekozen voor het kantinescherm.</p>
          <Link href="/kantine" className="kt-screen-btn">Kies wedstrijden →</Link>
        </div>
      ) : (
        <div className="kt-grid-screen" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {visible.map((m) => (
            <Tile key={m.id} match={m} fontSize={fontSize} logoSize={logoSize} />
          ))}
        </div>
      )}
    </div>
  )
}
