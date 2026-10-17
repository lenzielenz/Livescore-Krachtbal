'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import type { BoothFoto } from './photobooth'

// De photobooth op je scherm: de selfiecamera van je gsm (of de webcam), een aftelling van 3-2-1
// met een flits, en je foto als polaroid. Hang je hem aan de muur, dan komt hij naast de cabine en
// in de mozaïek van het clublogo, voor iedereen die het stadion van je club bezoekt. Je eigen
// foto's kan je hier altijd weer weghalen.

const B = 480
const H = 600

type Fase = 'start' | 'camera' | 'aftellen' | 'genomen' | 'bezig'

export function Photobooth({
  open,
  onSluit,
  ingelogd,
  eigen,
  onGehangen,
  onVerwijderd,
}: {
  open: boolean
  onSluit: () => void
  ingelogd: boolean
  eigen: BoothFoto[]
  onGehangen: (f: BoothFoto) => void
  onVerwijderd: (id: number) => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const doek = useRef<HTMLCanvasElement>(null)
  const stroom = useRef<MediaStream | null>(null)
  const [fase, setFase] = useState<Fase>('start')
  const [tel, setTel] = useState(3)
  const [flits, setFlits] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [foto, setFoto] = useState<Blob | null>(null)
  const [voorbeeld, setVoorbeeld] = useState<string | null>(null)
  // Pas als de video echt beelden geeft, mag je afdrukken (anders wordt de foto zwart).
  const [loopt, setLoopt] = useState(false)

  const stop = () => {
    stroom.current?.getTracks().forEach((t) => t.stop())
    stroom.current = null
    setLoopt(false)
  }
  useEffect(() => {
    if (!open) {
      stop()
      setFase('start')
      setFout(null)
      setFoto(null)
      setVoorbeeld((v) => {
        if (v) URL.revokeObjectURL(v)
        return null
      })
    }
    return () => stop()
  }, [open])

  // Meteen de camera aan bij het openen: dan staat de sluiterknop er al.
  useEffect(() => {
    if (open) void startCamera()
  }, [open])

  // De stroom aan de video hangen zodra die er staat. Niet "één beeld later" zoals vroeger: op een
  // tragere gsm stond de video er dan nog niet en bleef het beeld zwart.
  useEffect(() => {
    const v = video.current
    const s = stroom.current
    if (!v || !s || (fase !== 'camera' && fase !== 'aftellen')) return
    if (v.srcObject !== s) {
      v.srcObject = s
      // iOS: enkel stil en inline mag een video vanzelf spelen (zie de attributen hieronder).
      v.muted = true
      void v.play().catch(() => {})
    }
  }, [fase])

  const startCamera = async () => {
    setFout(null)
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setFout('De camera werkt enkel via een beveiligde verbinding (https).')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setFout('Je browser laat hier geen camera toe. Open de pagina in Safari of Chrome (niet in de app van Facebook of Instagram).')
      return
    }
    // Eerst de selfiecamera in een mooie resolutie; lukt dat niet (oudere gsm, webcam die het
    // niet kan), dan gewoon de selfiecamera, en anders eender welke camera.
    const pogingen: MediaStreamConstraints[] = [
      { video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 1200 } }, audio: false },
      { video: { facingMode: 'user' }, audio: false },
      { video: true, audio: false },
    ]
    let laatste: unknown = null
    for (const p of pogingen) {
      try {
        const s = await navigator.mediaDevices.getUserMedia(p)
        stop()
        stroom.current = s
        setFase('camera')
        return
      } catch (e) {
        laatste = e
        // Geweigerd of geen camera: een andere poging helpt niet.
        const naam = (e as { name?: string }).name
        if (naam === 'NotAllowedError' || naam === 'SecurityError' || naam === 'NotFoundError') break
      }
    }
    const naam = (laatste as { name?: string } | null)?.name
    setFout(
      naam === 'NotAllowedError' || naam === 'SecurityError'
        ? 'Je gaf geen toestemming voor de camera. Tik op het slotje (of "aA") naast het adres, sta de camera toe en probeer opnieuw.'
        : naam === 'NotFoundError'
          ? 'Geen camera gevonden op dit toestel.'
          : naam === 'NotReadableError'
            ? 'De camera is bezet door een andere app. Sluit die en probeer opnieuw.'
            : 'De camera startte niet. Probeer opnieuw.',
    )
  }

  const neem = () => {
    setFase('aftellen')
    let n = 3
    setTel(n)
    const iv = setInterval(() => {
      n -= 1
      if (n > 0) {
        setTel(n)
        return
      }
      clearInterval(iv)
      const v = video.current
      const c = doek.current
      if (!v || !c || !v.videoWidth) {
        setFase('camera')
        return
      }
      c.width = B
      c.height = H
      const g = c.getContext('2d')!
      // Bijsnijden tot staand 4:5, en spiegelen zoals je jezelf zag.
      const vw = v.videoWidth || B
      const vh = v.videoHeight || H
      const schaal = Math.max(B / vw, H / vh)
      const sw = B / schaal
      const sh = H / schaal
      g.save()
      g.translate(B, 0)
      g.scale(-1, 1)
      g.drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, B, H)
      g.restore()
      setFlits(true)
      setTimeout(() => setFlits(false), 380)
      if ('vibrate' in navigator) navigator.vibrate?.(30)
      c.toBlob(
        (b) => {
          if (!b) return
          setFoto(b)
          setVoorbeeld(URL.createObjectURL(b))
          setFase('genomen')
          stop()
        },
        'image/jpeg',
        0.9,
      )
    }, 900)
  }

  const hang = async () => {
    if (!foto) return
    setFase('bezig')
    setFout(null)
    try {
      const fd = new FormData()
      fd.append('foto', foto, 'selfie.jpg')
      const r = await fetch('/api/virtueel/photobooth', { method: 'POST', body: fd, credentials: 'include' })
      const d = (await r.json().catch(() => ({}))) as { foto?: BoothFoto; error?: string }
      if (!r.ok || !d.foto) throw new Error(d.error ?? 'Dat lukte niet.')
      onGehangen(d.foto)
      onSluit()
    } catch (e) {
      setFout((e as Error).message)
      setFase('genomen')
    }
  }

  const verwijder = async (id: number) => {
    const r = await fetch(`/api/virtueel/photobooth?id=${id}`, { method: 'DELETE', credentials: 'include' }).catch(() => null)
    if (r?.ok) onVerwijderd(id)
  }

  if (!open) return null
  return (
    <div className="vk-spel vk-booth" role="dialog" aria-label="Photobooth">
      <div className="vk-graf-kop">
        <div>
          <b>📸 Photobooth</b>
          <span>Je selfie als polaroid aan de muur, en in de mozaïek van het clublogo</span>
        </div>
        <button className="vk-graf-sluit" onClick={onSluit} aria-label="Sluiten">
          ✕
        </button>
      </div>
      <div className="vk-spel-inhoud vk-booth-inhoud">
        <div className="vk-booth-podium">
          <div className={`vk-booth-polaroid${fase === 'genomen' || fase === 'bezig' ? ' klaar' : ''}`}>
            <div className="vk-booth-beeld">
              {fase === 'start' && <span className="vk-booth-leeg">🙂</span>}
              {(fase === 'camera' || fase === 'aftellen') && (
                <video ref={video} playsInline muted autoPlay onLoadedData={() => setLoopt(true)} onPlaying={() => setLoopt(true)} />
              )}
              {voorbeeld && (fase === 'genomen' || fase === 'bezig') && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={voorbeeld} alt="Je selfie" />
              )}
              {fase === 'aftellen' && <span className="vk-booth-tel">{tel}</span>}
              {flits && <span className="vk-booth-flits" />}
            </div>
            <span className="vk-booth-onder">{fase === 'genomen' || fase === 'bezig' ? 'Mooi!' : 'Lach eens!'}</span>
          </div>
        </div>
        <canvas ref={doek} hidden />
        <div className="vk-booth-zij">
          {fout && <p className="vk-graf-fout">{fout}</p>}
          <div className="vk-booth-knoppen">
            {fase === 'start' && (
              <button className="vk-graf-plaats" onClick={() => void startCamera()}>
                📷 Camera aan
              </button>
            )}
            {(fase === 'camera' || fase === 'aftellen') && (
              <button className="vk-booth-sluiter" onClick={neem} disabled={fase === 'aftellen' || !loopt} aria-label="Neem de foto">
                <span />
              </button>
            )}
            {(fase === 'genomen' || fase === 'bezig') && (
              <>
                {ingelogd ? (
                  <button className="vk-graf-plaats" disabled={fase === 'bezig'} onClick={() => void hang()}>
                    {fase === 'bezig' ? 'Ophangen…' : '📌 Hang aan de muur'}
                  </button>
                ) : (
                  <Link className="vk-graf-plaats" href="/inloggen">
                    Log in om hem op te hangen
                  </Link>
                )}
                <button
                  className="vk-booth-opnieuw"
                  disabled={fase === 'bezig'}
                  onClick={() => {
                    setFoto(null)
                    setVoorbeeld((v) => {
                      if (v) URL.revokeObjectURL(v)
                      return null
                    })
                    void startCamera()
                  }}
                >
                  ↻ Opnieuw
                </button>
              </>
            )}
          </div>
          {eigen.length > 0 && (
            <div className="vk-booth-eigen">
              <b>Jouw foto’s aan de muur</b>
              <div>
                {eigen.map((f) => (
                  <span key={f.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.tegel || f.url} alt="" />
                    <button onClick={() => void verwijder(f.id)} aria-label="Foto weghalen">
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
          <p className="vk-graf-tip">Zichtbaar voor iedereen in het stadion van je club, verkleind en zonder locatiegegevens. Je kan hem altijd weer weghalen.</p>
        </div>
      </div>
    </div>
  )
}
