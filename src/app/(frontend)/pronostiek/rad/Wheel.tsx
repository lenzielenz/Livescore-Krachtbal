'use client'

import { useRef, useState } from 'react'

import './rad.css'

type Cand = { id: number; home: string; away: string }
type Chosen = { id: number; home: string; away: string }

// Het bonusrad: de weekendwinnaar draait en het rad landt achtereenvolgens op 3 wedstrijden die
// dubbele punten worden. De server kiest gezaghebbend (POST /api/pronostiek/spin); het rad animeert
// daar enkel naartoe — zo valt er niets te sjoemelen.
export function Wheel({ candidates }: { candidates: Cand[] }) {
  const n = candidates.length
  const seg = 360 / Math.max(1, n)
  const [rotation, setRotation] = useState(0)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [picked, setPicked] = useState<number[]>([]) // indices in candidates
  const [results, setResults] = useState<Chosen[]>([])
  const rotRef = useRef(0)

  // Twee-kleurige taart; gekozen segmenten worden goud.
  const gradient = `conic-gradient(${candidates
    .map((_, i) => {
      const start = (i * seg).toFixed(2)
      const end = ((i + 1) * seg).toFixed(2)
      const col = picked.includes(i) ? '#ffd166' : i % 2 === 0 ? 'color-mix(in srgb, var(--accent) 22%, var(--panel))' : 'var(--panel)'
      return `${col} ${start}deg ${end}deg`
    })
    .join(', ')})`

  const spinTo = (idx: number, extraSpins: number) =>
    new Promise<void>((resolve) => {
      // Breng het midden van segment idx onder de wijzer (boven, 0°). conic-gradient begint bovenaan
      // en draait met de klok mee, dus mik op een veelvoud van 360 minus de hoek van het segment.
      const target = Math.ceil(rotRef.current / 360) * 360 + extraSpins * 360 + (360 - (idx + 0.5) * seg)
      rotRef.current = target
      setRotation(target)
      window.setTimeout(resolve, 3600)
    })

  const spin = async () => {
    if (busy || done) return
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/pronostiek/spin', { method: 'POST', credentials: 'include' })
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; chosen?: Chosen[] }
      if (!res.ok || !j.ok || !Array.isArray(j.chosen)) throw new Error(j.error || 'Draaien mislukt.')
      // Animeer naar elke gekozen wedstrijd op haar beurt.
      for (let c = 0; c < j.chosen.length; c++) {
        const idx = candidates.findIndex((m) => m.id === j.chosen![c].id)
        if (idx < 0) continue
        await spinTo(idx, c === 0 ? 5 : 4)
        setPicked((p) => [...p, idx])
        setResults((r) => [...r, j.chosen![c]])
      }
      setDone(true)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rad">
      <div className="rad-stage">
        <span className="rad-pointer" aria-hidden>▼</span>
        <div className="rad-wheel" style={{ background: gradient, transform: `rotate(${rotation}deg)` }} role="img" aria-label="Bonusrad" />
        <div className="rad-hub" aria-hidden>🏆</div>
      </div>

      {!done ? (
        <button className="rad-btn" onClick={spin} disabled={busy}>
          {busy ? 'Draaien…' : '🎡 Draai aan het rad'}
        </button>
      ) : (
        <p className="rad-done">✨ De 3 bonuswedstrijden zijn gekozen! Deze week dubbele punten.</p>
      )}
      {err && <p className="rad-err">{err}</p>}

      {results.length > 0 && (
        <ul className="rad-results">
          {results.map((m) => (
            <li key={m.id} className="rad-result">
              <span className="rad-result-x">×2</span>
              <span className="rad-result-m">{m.home} <span className="rad-vs">–</span> {m.away}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
