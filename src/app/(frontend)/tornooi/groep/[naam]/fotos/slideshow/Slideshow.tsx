'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

import './slideshow.css'

// De foto's van de tornooidag als doorlopende slideshow, voor het scherm in de kantine ná het
// tornooi.
//
// Wat zo'n scherm moet overleven: uren aanstaan zonder toezicht. Daarom:
//   - HERHALEN zonder einde, en zonder de lijst opnieuw op te halen (die verandert niet meer);
//   - de VOLGENDE foto vooraf inladen, anders zie je bij elke wissel eerst een leeg vlak;
//   - de foto's ÉÉN keer inladen en daarna hergebruiken (de browser cachet ze), zodat een
//     avond draaien geen duizend verzoeken naar de server stuurt;
//   - een scherm dat SLAAPT en terugkomt, hervat gewoon — de teller loopt op de klok, niet op
//     een interval dat tijdens de slaapstand stilvalt.
//
// Bewust géén automatische fullscreen: browsers staan dat enkel toe na een tik, en een scherm
// dat uit zichzelf fullscreen springt is precies wat mensen niet verwachten. Er staat een knop.

export type SlideFoto = { id: number; src: string; uploaderName: string; opdracht: string | null }

/** Hoelang één foto blijft staan. Kort genoeg om te blijven boeien, lang genoeg om te kijken. */
const SECONDEN = [4, 6, 8, 12] as const

export function Slideshow({ naam, fotos }: { naam: string; fotos: SlideFoto[] }) {
  const [i, setI] = useState(0)
  const [duur, setDuur] = useState<number>(6)
  const [pauze, setPauze] = useState(false)
  const [vol, setVol] = useState(false)
  const doosRef = useRef<HTMLDivElement | null>(null)

  const volgende = useCallback(() => {
    setI((n) => (fotos.length ? (n + 1) % fotos.length : 0))
  }, [fotos.length])

  const vorige = useCallback(() => {
    setI((n) => (fotos.length ? (n - 1 + fotos.length) % fotos.length : 0))
  }, [fotos.length])

  // Doorschuiven op de klok. Bij een slapend scherm staat de tijd stil en pikt hij daarna
  // gewoon weer op — geen stapel ingehaalde wissels.
  useEffect(() => {
    if (pauze || fotos.length < 2) return
    const t = setInterval(volgende, duur * 1000)
    return () => clearInterval(t)
  }, [duur, pauze, volgende, fotos.length])

  // Sneltoetsen voor wie het scherm bedient: spatie pauzeert, pijltjes bladeren.
  useEffect(() => {
    const opToets = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault()
        setPauze((p) => !p)
      } else if (e.key === 'ArrowRight') volgende()
      else if (e.key === 'ArrowLeft') vorige()
    }
    window.addEventListener('keydown', opToets)
    return () => window.removeEventListener('keydown', opToets)
  }, [volgende, vorige])

  const naarVolledig = async () => {
    const el = doosRef.current
    if (!el) return
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        setVol(false)
      } else {
        await el.requestFullscreen()
        setVol(true)
      }
    } catch {
      /* browser weigert: dan blijft het gewoon een pagina */
    }
  }

  if (fotos.length === 0) {
    return (
      <div className="ss-leeg">
        <p>Nog geen foto’s van deze tornooidag.</p>
        <Link className="trn-btn" href={`/tornooi/groep/${encodeURIComponent(naam)}/fotos`}>← Terug</Link>
      </div>
    )
  }

  const nu = fotos[i]
  const straks = fotos[(i + 1) % fotos.length]

  return (
    <div className={`ss${vol ? ' vol' : ''}`} ref={doosRef}>
      <div className="ss-beeld" onClick={volgende} role="presentation">
        {/* eslint-disable-next-line @next/next/no-img-element -- eigen bestand achter een
            federatie-only route. */}
        <img key={nu.id} src={nu.src} alt={`Foto van ${nu.uploaderName || 'supporter'}`} />
        {/* De volgende alvast ophalen: zonder dit zie je bij elke wissel een leeg vlak. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="ss-vooraf" src={straks.src} alt="" aria-hidden />
        <div className="ss-onder">
          <span className="ss-wie">{nu.uploaderName || 'Supporter'}</span>
          {nu.opdracht && <span className="ss-opdracht">{nu.opdracht}</span>}
          <span className="ss-teller">{i + 1} / {fotos.length}</span>
        </div>
      </div>

      <div className="ss-balk">
        <button type="button" className="trn-btn" onClick={vorige}>‹</button>
        <button type="button" className="trn-btn" onClick={() => setPauze((p) => !p)}>
          {pauze ? '▶ Verder' : '⏸ Pauze'}
        </button>
        <button type="button" className="trn-btn" onClick={volgende}>›</button>
        <span className="ss-duur">
          {SECONDEN.map((s) => (
            <button
              key={s}
              type="button"
              className={`trn-mini${duur === s ? ' aan' : ''}`}
              onClick={() => setDuur(s)}
            >
              {s}s
            </button>
          ))}
        </span>
        <button type="button" className="trn-btn" onClick={() => void naarVolledig()}>
          {vol ? '✕ Verlaten' : '⛶ Volledig scherm'}
        </button>
        <Link className="trn-btn" href={`/tornooi/groep/${encodeURIComponent(naam)}/fotos`}>← Terug</Link>
      </div>
    </div>
  )
}
