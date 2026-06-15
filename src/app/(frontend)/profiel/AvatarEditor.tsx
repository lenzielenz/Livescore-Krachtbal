'use client'

import { useCallback, useRef, useState } from 'react'

import { LOGO_OFFSET_RANGE, LOGO_ZOOM_MAX, LOGO_ZOOM_MIN, logoFitStyle } from '@/lib/logo-fit'

const PREVIEW_PX = 200
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

// Profielfoto kiezen, inzoomen en verschuiven — dezelfde aanpak als bij clublogo's:
// we bewaren de originele foto + zoom/verschuiving en tonen die met een CSS-transform.
// "Wat je instelt is wat op je scorecard komt." Uploaden gaat meteen naar de server;
// de zoom/verschuiving bewaart het profielformulier samen met de rest.
export function AvatarEditor({
  url,
  zoom,
  offsetX,
  offsetY,
  setZoom,
  setOffsetX,
  setOffsetY,
  onUploaded,
}: {
  url: string | null
  zoom: number
  offsetX: number
  offsetY: number
  setZoom: (v: number) => void
  setOffsetX: (v: number) => void
  setOffsetY: (v: number) => void
  onUploaded: (url: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const drag = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null)

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!url) return
      e.currentTarget.setPointerCapture(e.pointerId)
      drag.current = { startX: e.clientX, startY: e.clientY, ox: offsetX, oy: offsetY }
    },
    [url, offsetX, offsetY],
  )
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current
      if (!d) return
      const dx = ((e.clientX - d.startX) / PREVIEW_PX) * 100
      const dy = ((e.clientY - d.startY) / PREVIEW_PX) * 100
      setOffsetX(Math.round(clamp(d.ox + dx, -LOGO_OFFSET_RANGE, LOGO_OFFSET_RANGE)))
      setOffsetY(Math.round(clamp(d.oy + dy, -LOGO_OFFSET_RANGE, LOGO_OFFSET_RANGE)))
    },
    [setOffsetX, setOffsetY],
  )
  const endDrag = useCallback(() => {
    drag.current = null
  }, [])

  const upload = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/profile/photo', { method: 'POST', body: fd, credentials: 'include' })
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!res.ok || !data.url) {
        setError(data.error ?? 'Uploaden mislukt.')
        return
      }
      setZoom(1)
      setOffsetX(0)
      setOffsetY(0)
      onUploaded(data.url)
    } catch {
      setError('Er ging iets mis bij het uploaden.')
    } finally {
      setBusy(false)
    }
  }

  const imgStyle = logoFitStyle({ zoom, offsetX, offsetY })

  return (
    <div className="pf-avatar">
      <div
        className="pf-avatar-ring"
        style={{ width: PREVIEW_PX, height: PREVIEW_PX, cursor: url ? (drag.current ? 'grabbing' : 'grab') : 'default' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Profielfoto" draggable={false} style={{ ...imgStyle }} />
        ) : (
          <span className="pf-avatar-empty" aria-hidden>👤</span>
        )}
      </div>

      <div className="pf-avatar-ctrl">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void upload(f)
            e.target.value = ''
          }}
        />
        <button type="button" className="wb-btn" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? 'Uploaden…' : url ? '📷 Andere foto' : '📷 Foto uploaden'}
        </button>

        {url && (
          <>
            <label className="pf-zoom">
              Zoom: {zoom.toFixed(2)}×
              <input
                type="range"
                min={LOGO_ZOOM_MIN}
                max={LOGO_ZOOM_MAX}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
            </label>
            <p className="pf-hint">Sleep de foto in de cirkel om ze te verschuiven.</p>
          </>
        )}
        {error && <p className="wb-msg" style={{ color: '#e0533d' }}>{error}</p>}
      </div>
    </div>
  )
}
