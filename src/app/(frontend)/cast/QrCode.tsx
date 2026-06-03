'use client'

import { useEffect, useState } from 'react'

// QR-code voor een scherm-URL, volledig client-side gegenereerd (geen externe dienst).
// Scan met het toestel dat de tv aanstuurt om het scherm in één tik te openen.
export function QrCode({ value, size = 168 }: { value: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const QR = await import('qrcode')
        const url = await QR.toDataURL(value, {
          margin: 1,
          width: size * 2,
          color: { dark: '#06140d', light: '#ffffff' },
        })
        if (active) setDataUrl(url)
      } catch {
        if (active) setDataUrl(null)
      }
    })()
    return () => {
      active = false
    }
  }, [value, size])

  if (!dataUrl) return <div className="cast-qr-skel" style={{ width: size, height: size }} />
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="cast-qr-img" src={dataUrl} alt="QR-code" width={size} height={size} />
}
