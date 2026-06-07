'use client'

import { useField } from '@payloadcms/ui'
import type { NumberFieldClientComponent } from 'payload'
import { useCallback, useRef } from 'react'

import {
  LOGO_OFFSET_RANGE,
  LOGO_ZOOM_MAX,
  LOGO_ZOOM_MIN,
  logoFitStyle,
} from '@/lib/logo-fit'
import { useClubLogoUrl } from './use-club-logo-url'

// Aangepaste Field-component op het Club-formulier. Toont een ronde voorvertoning
// die exact overeenkomt met de badge op de site (witte achtergrond, contain, ronde
// uitsnede). De beheerder kan inzoomen met de schuifregelaar en het logo verslepen
// om het perfect te positioneren — "wat je opslaat is wat het publiek ziet".
// Werkt ook voor bestaande clubs: zonder aanpassing valt alles terug op zoom 1.
const PREVIEW_PX = 160

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export const LogoFitEditor: NumberFieldClientComponent = ({ path }) => {
  const { value: zoom, setValue: setZoom } = useField<number>({ path })
  const { value: offsetX, setValue: setOffsetX } = useField<number>({ path: 'logoOffsetX' })
  const { value: offsetY, setValue: setOffsetY } = useField<number>({ path: 'logoOffsetY' })

  const { url } = useClubLogoUrl()

  const z = typeof zoom === 'number' && zoom > 0 ? zoom : 1
  const ox = typeof offsetX === 'number' ? offsetX : 0
  const oy = typeof offsetY === 'number' ? offsetY : 0

  // Slepen om te positioneren.
  const boxRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null)

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!url) return
      e.currentTarget.setPointerCapture(e.pointerId)
      drag.current = { startX: e.clientX, startY: e.clientY, ox, oy }
    },
    [url, ox, oy],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current
      if (!d) return
      // Pixelverplaatsing → percentage van de badge.
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

  const reset = useCallback(() => {
    setZoom(1)
    setOffsetX(0)
    setOffsetY(0)
  }, [setZoom, setOffsetX, setOffsetY])

  const imgStyle = logoFitStyle({ zoom: z, offsetX: ox, offsetY: oy })

  return (
    <div className="field-type" style={{ marginBottom: 20 }}>
      <label className="field-label">Logo bijsnijden &amp; voorvertoning</label>
      <p style={{ fontSize: 13, color: 'var(--theme-elevation-500)', margin: '0 0 10px' }}>
        Zoom in en versleep het logo zodat het de ronde badge perfect vult. Dit is exact hoe het
        logo op de site getoond wordt.
      </p>

      {url ? (
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Ronde voorvertoning — zelfde styling als de live-badge. */}
          <div
            ref={boxRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{
              width: PREVIEW_PX,
              height: PREVIEW_PX,
              borderRadius: '50%',
              overflow: 'hidden',
              background: '#fff',
              border: '1px solid var(--theme-elevation-200)',
              boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
              cursor: drag.current ? 'grabbing' : 'grab',
              touchAction: 'none',
              flexShrink: 0,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="Logo-voorvertoning"
              draggable={false}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                padding: 14,
                ...imgStyle,
                pointerEvents: 'none',
                userSelect: 'none',
              }}
            />
          </div>

          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              Zoom: {z.toFixed(2)}×
            </label>
            <input
              type="range"
              min={LOGO_ZOOM_MIN}
              max={LOGO_ZOOM_MAX}
              step={0.05}
              value={z}
              onChange={(e) => setZoom(Number(e.target.value))}
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button type="button" className="btn btn--style-secondary btn--size-small" onClick={reset}>
                Herstellen
              </button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--theme-elevation-450)', marginTop: 10 }}>
              Sleep het logo in de cirkel om het te verschuiven.
            </p>
          </div>
        </div>
      ) : (
        <div
          style={{
            padding: '14px 16px',
            borderRadius: 4,
            background: 'var(--theme-elevation-50)',
            border: '1px solid var(--theme-elevation-150)',
            color: 'var(--theme-elevation-500)',
            fontSize: 14,
          }}
        >
          Upload eerst een logo hierboven (of geef een logo-URL op) om de voorvertoning en zoom te gebruiken.
        </div>
      )}
    </div>
  )
}
