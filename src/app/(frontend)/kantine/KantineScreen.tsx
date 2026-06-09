'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { Tile, type KantineMatch } from './KantineBoard'

// Layout die meeschaalt met het aantal getoonde borden: weinig wedstrijden = grote vakken die
// het scherm vullen, meer wedstrijden = meer kolommen en kleinere vakken.
function layoutFor(n: number): { cols: number; fontSize: number; logoSize: string } {
  if (n <= 1) return { cols: 1, fontSize: 34, logoSize: 'clamp(130px, 22vmin, 300px)' }
  if (n <= 2) return { cols: 2, fontSize: 28, logoSize: 'clamp(100px, 16vmin, 220px)' }
  if (n <= 4) return { cols: 2, fontSize: 23, logoSize: 'clamp(80px, 13vmin, 180px)' }
  if (n <= 6) return { cols: 3, fontSize: 19, logoSize: 'clamp(62px, 10vmin, 132px)' }
  if (n <= 9) return { cols: 3, fontSize: 17, logoSize: 'clamp(54px, 8.5vmin, 112px)' }
  if (n <= 12) return { cols: 4, fontSize: 15, logoSize: 'clamp(44px, 6.5vmin, 92px)' }
  return { cols: 5, fontSize: 13, logoSize: 'clamp(36px, 5.5vmin, 76px)' }
}

// Het eigenlijke kantinescherm (kantine-tv): toont de centraal gekozen wedstrijden als live
// borden. Pollt de selectie elke 12s zodat wijzigingen op een ander toestel vanzelf doorkomen;
// de scores binnen elk bord lopen live via SSE. De layout past zich aan aan het aantal borden.
// Maximaal aantal kolommen dat een schermbreedte comfortabel aankan (tablet/telefoon meegerekend).
function maxColsForWidth(w: number): number {
  if (w < 560) return 1
  if (w < 900) return 2
  if (w < 1300) return 3
  if (w < 1700) return 4
  return 5
}

export function KantineScreen({
  endpoint = '/api/kantine',
  editable = true,
  title,
}: {
  /** Bron van de wedstrijden (default: de centrale selectie). */
  endpoint?: string
  /** Toon de "Aanpassen"-link + kies-CTA (enkel op de bedienbare versie). */
  editable?: boolean
  /** Titel/onderschrift, bv. de clubnaam op een vaste club-link. */
  title?: string
} = {}) {
  const [matches, setMatches] = useState<KantineMatch[]>([])
  const [loaded, setLoaded] = useState(false)
  // Viewport-breedte volgen zodat het raster niet 5 kolommen op een tablet propt (AUDIT §1).
  const [vw, setVw] = useState(1920)

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const r = await fetch(endpoint, { cache: 'no-store' })
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
  }, [endpoint])

  // Toon de gespeelde wedstrijden (live + afgelopen): een afgelopen wedstrijd blijft staan, en
  // zodra een geplande wedstrijd start komt ze er vanzelf bij. Zolang er nog niets begonnen is,
  // tonen we de geplande wedstrijden (anders zou het scherm leeg zijn vóór de aftrap).
  const played = matches.filter((m) => m.status !== 'scheduled')
  const visible = played.length > 0 ? played : matches
  const layout = layoutFor(visible.length)
  // Begrens de kolommen op wat de schermbreedte aankan; bij minder kolommen iets groter lettertype.
  const cols = Math.min(layout.cols, maxColsForWidth(vw))
  const fontSize = cols < layout.cols ? Math.round(layout.fontSize * 1.12) : layout.fontSize
  const logoSize = layout.logoSize

  return (
    <div className="kt-screen">
      {editable && <Link href="/kantine" className="kt-screen-edit">‹ Aanpassen</Link>}
      {title && <span className="kt-screen-title">{title}</span>}
      {loaded && matches.length === 0 ? (
        <div className="kt-screen-empty">
          {editable ? (
            <>
              <p>Nog geen wedstrijden gekozen voor het kantinescherm.</p>
              <Link href="/kantine" className="kt-screen-btn">Kies wedstrijden →</Link>
            </>
          ) : (
            <p>Vandaag geen wedstrijden{title ? ` voor ${title}` : ''}. Zodra er een wedstrijd is, verschijnt ze hier vanzelf.</p>
          )}
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
