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

  const stop = () => {
    stroom.current?.getTracks().forEach((t) => t.stop())
    stroom.current = null
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

  const startCamera = async () => {
    setFout(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setFout('Je toestel of browser laat geen camera toe.')
      return
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 1200 } }, audio: false })
      stop()
      stroom.current = s
      setFase('camera')
      requestAnimationFrame(() => {
        if (video.current) {
          video.current.srcObject = s
          void video.current.play().catch(() => {})
        }
      })
    } catch {
      setFout('Geen toegang tot de camera. Sta het toe in je browser en probeer opnieuw.')
    }
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
      if (!v || !c) return
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
              {(fase === 'camera' || fase === 'aftellen') && <video ref={video} playsInline muted />}
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
              <button className="vk-booth-sluiter" onClick={neem} disabled={fase === 'aftellen'} aria-label="Neem de foto">
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
