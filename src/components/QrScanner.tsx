'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Camera-scanner voor de QR-code op de gsm van de scheidsrechter. Gebruikt de native
// BarcodeDetector-API (Chrome/Android). Niet ondersteund? Dan tonen we een nette melding en
// valt men terug op de code (backup). De gescande waarde gaat via onResult naar de oproeper.
export function QrScanner({
  onResult,
  label = '📷 Scan QR van de scheidsrechter',
}: {
  onResult: (value: string) => void
  label?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const [active, setActive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setActive(false)
  }, [])

  const start = useCallback(async () => {
    setError(null)
    if (typeof window === 'undefined' || !window.BarcodeDetector) {
      setError('Scannen wordt niet ondersteund op dit toestel — gebruik de code hieronder.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream
      setActive(true)
      const video = videoRef.current!
      video.srcObject = stream
      await video.play()
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
      const tick = async () => {
        if (!streamRef.current) return
        try {
          const codes = await detector.detect(video)
          if (codes.length > 0 && codes[0].rawValue) {
            const value = codes[0].rawValue
            stop()
            onResult(value)
            return
          }
        } catch {
          // tijdelijke detectiefout — gewoon volgende frame proberen
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch {
      setError('Geen toegang tot de camera. Geef toestemming of gebruik de code.')
      stop()
    }
  }, [onResult, stop])

  // Camera netjes vrijgeven bij unmount.
  useEffect(() => () => stop(), [stop])

  return (
    <div className="qr-scan">
      <video ref={videoRef} className="qr-scan-video" playsInline muted style={{ display: active ? 'block' : 'none' }} />
      <div className="wb-btn-row" style={{ marginTop: active ? 10 : 0 }}>
        {active ? (
          <button type="button" onClick={stop} className="wb-btn">
            ✕ Stop scannen
          </button>
        ) : (
          <button type="button" onClick={start} className="wb-btn wb-btn-primary">
            {label}
          </button>
        )}
      </div>
      {error && <p className="wb-msg" style={{ color: '#e0533d' }}>{error}</p>}
    </div>
  )
}
