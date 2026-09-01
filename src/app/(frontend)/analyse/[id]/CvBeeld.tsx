'use client'

import { useEffect, useRef, useState } from 'react'

import { beeldTijden } from '@/lib/cv-review'

// Het beeld bij de vraag: een kort lusje rond het moment van één CV-voorstel.
//
// Waarom dit er is. Een voorstel was een tíjdstip — "04:21, worp, 21%" — en om te zien waarover
// de vraag ging moest je zelf in de video naar 04:21 scrubben. Bij 21 voorstellen is dat 21 keer
// zoeken vóór je één ding beoordeeld hebt. De vraag hoort met het beeld te komen.
//
// En bewust een lúsje, geen foto: een worp ís beweging. Op één still staat een speler met de bal
// en kan niemand zeggen of hij die loslaat of net ving — precies de vraag die hier beantwoord
// moet worden. Vijf beelden over acht tienden van een seconde beslissen dat wel.
//
// Hoe: een eigen, onzichtbare videospeler naast de zichtbare. Die springt naar elk tijdstip en
// tekent het beeld op een canvas. De zichtbare speler blijft dus staan waar de kijker hem liet
// — anders zou het reviewpaneel voortdurend de video van onder je vinger wegtrekken. Werkt enkel
// op een geüpload bestand: een YouTube-speler laat zijn beeld niet uitlezen (zelfde grens als de
// kalibratie).

/** Breedte waarop de beelden bewaard worden. Genoeg om een zwaai te zien, klein genoeg om er
 *  vijf van in het geheugen te houden zonder een telefoon te laten zwoegen. */
const BREEDTE = 640
/** Hoe snel het lusje speelt (ms per beeld) — traag genoeg om te kunnen kíjken. */
const LUS_MS = 180

export function CvBeeld({
  videoSrc,
  tijd,
  duurS,
  onSpring,
}: {
  /** Bronbestand van de wedstrijdvideo; null bij YouTube of geen video. */
  videoSrc: string | null
  /** Het moment van het voorstel, in videoseconden. */
  tijd: number
  /** Duur van de video, als de speler die al kent — houdt het lusje binnen de video. */
  duurS?: number | null
  /** Naar dit moment springen in de échte speler (voor wie het in de video wil bekijken). */
  onSpring?: () => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [beelden, setBeelden] = useState<string[]>([])
  const [i, setI] = useState(0)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  // De beelden ophalen. Elke wissel van voorstel (of van video) begint opnieuw; een vorige,
  // nog lopende ophaling wordt via `geldig` genegeerd in plaats van afgebroken — het springen
  // zelf valt niet te annuleren, en half getekende beelden van het vórige voorstel tonen is
  // erger dan even wachten.
  useEffect(() => {
    const v = videoRef.current
    if (!videoSrc || !v) {
      setBeelden([])
      return
    }
    let geldig = true
    setBezig(true)
    setFout(null)
    setBeelden([])
    setI(0)

    const wacht = (naam: 'seeked' | 'loadeddata') =>
      new Promise<void>((klaar, mis) => {
        const ok = () => {
          v.removeEventListener(naam, ok)
          v.removeEventListener('error', nok)
          klaar()
        }
        const nok = () => {
          v.removeEventListener(naam, ok)
          v.removeEventListener('error', nok)
          mis(new Error('video'))
        }
        v.addEventListener(naam, ok, { once: true })
        v.addEventListener('error', nok, { once: true })
      })

    void (async () => {
      try {
        if (v.readyState < 2) await wacht('loadeddata')
        const duur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : (duurS ?? null)
        const doel = beeldTijden(tijd, duur)
        const doek = document.createElement('canvas')
        const schaal = v.videoWidth > 0 ? Math.min(1, BREEDTE / v.videoWidth) : 1
        doek.width = Math.max(1, Math.round((v.videoWidth || BREEDTE) * schaal))
        doek.height = Math.max(1, Math.round((v.videoHeight || Math.round(BREEDTE * 0.5625)) * schaal))
        const ctx = doek.getContext('2d')
        if (!ctx) throw new Error('canvas')
        const uit: string[] = []
        for (const t of doel) {
          if (!geldig) return
          v.currentTime = t
          await wacht('seeked')
          if (!geldig) return
          ctx.drawImage(v, 0, 0, doek.width, doek.height)
          uit.push(doek.toDataURL('image/jpeg', 0.72))
          // Elk beeld meteen tonen: dan staat het middelste er al terwijl de rest nog komt,
          // in plaats van een lege doos van een seconde.
          setBeelden([...uit])
        }
      } catch {
        if (geldig) setFout('Het beeld van dit moment kon niet geladen worden — bekijk het in de video.')
      } finally {
        if (geldig) setBezig(false)
      }
    })()

    return () => {
      geldig = false
    }
  }, [videoSrc, tijd, duurS])

  // Het lusje. Pas laten lopen als er meer dan één beeld is: één beeld dat "knippert" is
  // enkel verwarrend.
  useEffect(() => {
    if (beelden.length < 2) return
    const tik = setInterval(() => setI((n) => (n + 1) % beelden.length), LUS_MS)
    return () => clearInterval(tik)
  }, [beelden.length])

  if (!videoSrc) return null

  return (
    <div className="cvb">
      {/* De onzichtbare bron. In de DOM en niet losstaand: sommige browsers decoderen geen
          video die nergens hangt, en `display:none` zet het decoderen óók stil. */}
      <video
        ref={videoRef}
        className="cvb-bron"
        src={videoSrc}
        crossOrigin="anonymous"
        muted
        playsInline
        preload="auto"
        aria-hidden
      />
      <div className="cvb-doos">
        {beelden.length > 0 ? (
          /* eslint-disable-next-line @next/next/no-img-element --
             een data-URL uit een canvas: er valt niets te optimaliseren en next/image zou hem
             enkel door een loader duwen. */
          <img className="cvb-beeld" src={beelden[Math.min(i, beelden.length - 1)]} alt="Het moment van dit voorstel" />
        ) : (
          <div className="cvb-leeg">{fout ?? (bezig ? 'Beeld ophalen…' : '')}</div>
        )}
        {onSpring && (
          <button type="button" className="cvb-spring" onClick={onSpring} title="Dit moment in de video bekijken">
            ▶ in de video
          </button>
        )}
      </div>
    </div>
  )
}
