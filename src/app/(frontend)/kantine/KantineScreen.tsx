'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { Tile, type KantineMatch } from './KantineBoard'

// Het eigenlijke kantinescherm (kantine-tv): toont de centraal gekozen wedstrijden als live
// borden. Pollt de selectie elke 12s zodat wijzigingen op een ander toestel vanzelf doorkomen;
// de scores binnen elk bord lopen live via SSE.
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

  return (
    <div className="kt-screen">
      <Link href="/kantine" className="kt-screen-edit">‹ Aanpassen</Link>
      {loaded && matches.length === 0 ? (
        <div className="kt-screen-empty">
          <p>Nog geen wedstrijden gekozen voor het kantinescherm.</p>
          <Link href="/kantine" className="kt-screen-btn">Kies wedstrijden →</Link>
        </div>
      ) : (
        <div className="kt-grid kt-grid-screen">
          {matches.map((m) => (
            <Tile key={m.id} match={m} />
          ))}
        </div>
      )}
    </div>
  )
}
