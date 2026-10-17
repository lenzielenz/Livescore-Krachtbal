'use client'

import { useEffect, useRef, useState } from 'react'

import type { Kermisspel, SpelUitslag } from './kermis'

// Het venster van een kermisspel (krachtmeter, blikken gooien, eendjes vissen): een meter die op en
// neer gaat, één knop, en wat het opleverde. Bij de krachtmeter mik je bovenaan, bij de blikken in
// het midden; eendjes vissen is geluk (geen meter).

const TEMPO: Record<Kermisspel['id'], number> = { krachtmeter: 1.5, blikken: 1.15, eendjes: 0 }
/** Even wachten na een beurt, zodat de animatie (de schuif, de blikken, de eend) te zien is. */
const RUST_MS = 1600

export function KermisspelPaneel({ spel, onSluit, onUitslag }: { spel: Kermisspel; onSluit: () => void; onUitslag?: (u: SpelUitslag) => void }) {
  const [waarde, setWaarde] = useState(0)
  const [uitslag, setUitslag] = useState<SpelUitslag | null>(null)
  const [rust, setRust] = useState(false)
  const waardeRef = useRef(0)
  const beurten = useRef(0)

  // De meter: een driehoeksgolf van 0 naar 1 en terug; elke beurt een tikje sneller (het moet een
  // uitdaging blijven).
  useEffect(() => {
    if (!spel.meter) return
    let raf = 0
    const t0 = performance.now()
    const tik = (nu: number) => {
      const tempo = TEMPO[spel.id] * (1 + Math.min(beurten.current, 8) * 0.06)
      const f = (((nu - t0) / 1000) * tempo) % 2
      const v = f < 1 ? f : 2 - f
      waardeRef.current = v
      setWaarde(v)
      raf = requestAnimationFrame(tik)
    }
    raf = requestAnimationFrame(tik)
    return () => cancelAnimationFrame(raf)
  }, [spel])

  const speel = () => {
    if (rust) return
    beurten.current++
    const u = spel.speel(waardeRef.current)
    setUitslag(u)
    onUitslag?.(u)
    setRust(true)
    setTimeout(() => setRust(false), RUST_MS)
  }

  // Spatie of Enter speelt ook (handig op een computer).
  useEffect(() => {
    const toets = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault()
        speel()
      } else if (e.code === 'Escape') onSluit()
    }
    window.addEventListener('keydown', toets)
    return () => window.removeEventListener('keydown', toets)
  })

  const doel = spel.id === 'blikken' ? 'midden' : 'boven'
  return (
    <div className="vk-kspel" role="dialog" aria-label={spel.naam}>
      <div className="vk-kspel-kop">
        <b>{spel.naam}</b>
        <button className="vk-kspel-sluit" onClick={onSluit} aria-label="Sluiten">
          ✕
        </button>
      </div>
      <p className="vk-kspel-uitleg">{spel.uitleg}</p>
      {spel.meter && (
        <div className={`vk-kspel-meter doel-${doel}`} aria-hidden>
          <div className="vk-kspel-zone" />
          <div className="vk-kspel-naald" style={{ bottom: `${waarde * 100}%` }} />
        </div>
      )}
      <button className="vk-kspel-knop" onClick={speel} disabled={rust}>
        {spel.knop}
      </button>
      {uitslag && <p className={`vk-kspel-uitslag${uitslag.goed ? ' goed' : ''}`}>{uitslag.tekst}</p>}
    </div>
  )
}
