'use client'

import { useRef, useState } from 'react'

// Het veld één keer aanwijzen op een beeld uit de video: waar liggen de lijnkruisingen?
// Daarmee kan de server elk punt in beeld omrekenen naar meters op het veld — zonder deze
// stap weet hij wél wanneer er geworpen wordt, maar niet waar de bal landt.
//
// Het frame komt uit de video in de browser (canvas), dus de server hoeft er niets voor te
// doen. Werkt enkel op een geüpload bestand: een YouTube-speler laat zijn beeld niet uitlezen.

/** De kruispunten die we vragen, in de volgorde waarin ze het makkelijkst te vinden zijn. */
const PUNTEN = [
  { label: 'achterlijn_thuis_links', uitleg: 'Achterlijn dichtste kant — linkerhoek' },
  { label: 'achterlijn_thuis_rechts', uitleg: 'Achterlijn dichtste kant — rechterhoek' },
  { label: 'doellijn_thuis_links', uitleg: 'Doellijn dichtste kant — links' },
  { label: 'doellijn_thuis_rechts', uitleg: 'Doellijn dichtste kant — rechts' },
  { label: 'middellijn_links', uitleg: 'Middellijn — links' },
  { label: 'middellijn_rechts', uitleg: 'Middellijn — rechts' },
  { label: 'doellijn_uit_links', uitleg: 'Doellijn verste kant — links' },
  { label: 'doellijn_uit_rechts', uitleg: 'Doellijn verste kant — rechts' },
  { label: 'achterlijn_uit_links', uitleg: 'Achterlijn verste kant — linkerhoek' },
  { label: 'achterlijn_uit_rechts', uitleg: 'Achterlijn verste kant — rechterhoek' },
] as const

type Punt = { label: string; x: number; y: number }

export function Kalibreren({
  matchId,
  videoUrl,
  initieel,
}: {
  matchId: number
  videoUrl: string | null
  initieel: { punten?: Punt[] } | null
}) {
  const [punten, setPunten] = useState<Punt[]>(initieel?.punten ?? [])
  const [frame, setFrame] = useState<string | null>(null)
  const [afmeting, setAfmeting] = useState<{ w: number; h: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [melding, setMelding] = useState<string | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const isBestand = Boolean(videoUrl && !/youtu\.?be/i.test(videoUrl))
  const volgende = PUNTEN.find((p) => !punten.some((q) => q.label === p.label)) ?? null

  const pakFrame = () => {
    const v = videoRef.current
    if (!v || !v.videoWidth) {
      setFout('De video is nog niet geladen — speel ze even af en probeer opnieuw.')
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(v, 0, 0)
    setAfmeting({ w: v.videoWidth, h: v.videoHeight })
    setFrame(canvas.toDataURL('image/jpeg', 0.85))
    setFout(null)
    setMelding(null)
  }

  const klik = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!volgende || !afmeting) return
    const rect = e.currentTarget.getBoundingClientRect()
    // Van weergavepixels naar de échte beeldpixels: de server rekent met de videoresolutie.
    const x = ((e.clientX - rect.left) / rect.width) * afmeting.w
    const y = ((e.clientY - rect.top) / rect.height) * afmeting.h
    setPunten((p) => [...p, { label: volgende.label, x: Math.round(x), y: Math.round(y) }])
  }

  const bewaar = async () => {
    setBusy(true)
    setFout(null)
    setMelding(null)
    try {
      const res = await fetch(`/api/cv/match/${matchId}/kalibratie`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ punten, beeldBreedte: afmeting?.w, beeldHoogte: afmeting?.h }),
      })
      const data = (await res.json()) as { error?: string; fout_px?: number }
      if (!res.ok) {
        setFout(data.error ?? 'Bewaren mislukt.')
        return
      }
      setMelding(
        data.fout_px != null
          ? `Bewaard — de punten kloppen tot op ${data.fout_px.toFixed(1)} pixel met een echt veld.`
          : 'Bewaard.',
      )
    } catch {
      setFout('Netwerkfout — probeer opnieuw.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="an-fold kal" id="kalibratie">
      <summary>
        📍 Veldkalibratie{' '}
        <span className="tm-sum">
          {punten.length >= 4
            ? `${punten.length} punten aangeduid — de server kan afstanden berekenen`
            : 'nog niet gezet — nodig om te weten wáár de bal landt'}
        </span>
      </summary>
      <div className="kal-body">
        {!isBestand ? (
          <p className="sa-let-op">
            Kalibreren kan alleen op een geüploade video. Een YouTube-speler laat zijn beeld niet
            uitlezen — upload het bestand om ook zones en afstanden te laten berekenen.
          </p>
        ) : (
          <>
            <p className="tm-lead">
              Wijs één keer aan waar de lijnen van dít veld liggen. Zet de video op een beeld waarop
              je zoveel mogelijk lijnen ziet, neem het frame, en tik dan de gevraagde punten aan.
              Vier punten volstaat; hoe meer je er aanduidt, hoe nauwkeuriger.
            </p>

            <video
              ref={videoRef}
              className="kal-video"
              src={videoUrl ?? undefined}
              controls
              playsInline
              crossOrigin="anonymous"
              preload="metadata"
            />
            <div className="kal-acties">
              <button type="button" className="va-btn" onClick={pakFrame}>
                📷 Neem dit beeld
              </button>
              {punten.length > 0 && (
                <>
                  <button type="button" className="va-btn" onClick={() => setPunten((p) => p.slice(0, -1))}>
                    ↶ Laatste punt weg
                  </button>
                  <button type="button" className="va-btn" onClick={() => setPunten([])}>
                    Alles wissen
                  </button>
                </>
              )}
            </div>

            {frame && (
              <div className="kal-doek">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={frame} alt="Videobeeld om het veld op aan te duiden" onClick={klik} />
                {afmeting &&
                  punten.map((p, i) => (
                    <span
                      key={p.label}
                      className="kal-punt"
                      style={{ left: `${(p.x / afmeting.w) * 100}%`, top: `${(p.y / afmeting.h) * 100}%` }}
                      title={p.label}
                    >
                      {i + 1}
                    </span>
                  ))}
              </div>
            )}

            {frame && (
              <p className="kal-volgende">
                {volgende ? (
                  <>
                    Tik nu aan: <strong>{volgende.uitleg}</strong>
                    <span className="sa-hint"> ({punten.length} van de {PUNTEN.length} gezet)</span>
                  </>
                ) : (
                  <>Alle punten gezet. Bewaar hieronder.</>
                )}
              </p>
            )}

            <div className="tm-acties">
              <button
                type="button"
                className="va-btn primary"
                disabled={busy || punten.length < 4}
                onClick={() => void bewaar()}
              >
                {busy ? 'Bewaren…' : 'Kalibratie bewaren'}
              </button>
              {punten.length > 0 && punten.length < 4 && (
                <span className="sa-hint">Minstens vier punten nodig.</span>
              )}
              {melding && <span className="tm-ok">{melding}</span>}
              {fout && <span className="tm-fout">{fout}</span>}
            </div>
          </>
        )}
      </div>
    </details>
  )
}
