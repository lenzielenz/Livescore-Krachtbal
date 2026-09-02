'use client'

import { useField, useFormFields } from '@payloadcms/ui'
import type { NumberFieldClientComponent } from 'payload'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  OFFSET_BEREIK,
  ROTATIE_BEREIK,
  uitsnedeStijl,
  ZOOM_MAX,
  ZOOM_MIN,
} from '@/lib/reclame'

// Bijsnijden van een reclamebeeld, met de bannertegel als voorvertoning.
//
// Reclame komt binnen zoals ze binnenkomt: een liggende banner, een vierkant logo, of een foto van
// een sponsorbord die scheef genomen is. Hier zet de beheerder dat recht: zoomen, slepen en
// draaien tot het beeld vol en waterpas in de tegel staat.
//
// De voorvertoning is dezelfde tegel als op het kantinescherm — zelfde verhouding, zelfde marge,
// zelfde achtergrond. Wat je hier ziet is wat de kantine ziet; dat is het hele punt van bijsnijden
// in de admin in plaats van achteraf ontdekken dat het scheef hangt.

/** Verhouding van de bannertegel op het scherm (breed en laag). */
const VOORBEELD_B = 300
const VOORBEELD_H = 96

const klem = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** De URL van de geüploade afbeelding van deze reclame. */
function useReclameUrl(): string | null {
  const waarde = useFormFields(([fields]) => fields?.afbeelding?.value)
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (waarde && typeof waarde === 'object' && 'url' in waarde && typeof (waarde as { url?: string }).url === 'string') {
      setUrl((waarde as { url: string }).url)
      return
    }
    const id = waarde && typeof waarde === 'object' && 'id' in waarde ? (waarde as { id: number }).id : waarde
    if (id === null || id === undefined || id === '') {
      setUrl(null)
      return
    }
    let af = false
    fetch(`/api/media/${id}?depth=0`)
      .then((r) => (r.ok ? r.json() : null))
      .then((doc) => {
        if (!af) setUrl(doc && typeof doc.url === 'string' ? doc.url : null)
      })
      .catch(() => {
        if (!af) setUrl(null)
      })
    return () => {
      af = true
    }
  }, [waarde])

  return url
}

export const ReclameFitEditor: NumberFieldClientComponent = ({ path }) => {
  const { value: zoom, setValue: setZoom } = useField<number>({ path })
  const { value: offsetX, setValue: setOffsetX } = useField<number>({ path: 'offsetX' })
  const { value: offsetY, setValue: setOffsetY } = useField<number>({ path: 'offsetY' })
  const { value: rotatie, setValue: setRotatie } = useField<number>({ path: 'rotatie' })
  const achtergrond = useFormFields(([fields]) => fields?.achtergrond?.value)

  const url = useReclameUrl()

  const z = typeof zoom === 'number' && zoom > 0 ? zoom : 1
  const ox = typeof offsetX === 'number' ? offsetX : 0
  const oy = typeof offsetY === 'number' ? offsetY : 0
  const rot = typeof rotatie === 'number' ? rotatie : 0

  // Slepen om te positioneren — hetzelfde gebaar als bij de clublogo's.
  const sleep = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  const opNeer = useCallback(
    (e: React.PointerEvent) => {
      if (!url) return
      e.currentTarget.setPointerCapture(e.pointerId)
      sleep.current = { x: e.clientX, y: e.clientY, ox, oy }
    },
    [url, ox, oy],
  )

  const opBeweeg = useCallback(
    (e: React.PointerEvent) => {
      const d = sleep.current
      if (!d) return
      const dx = ((e.clientX - d.x) / VOORBEELD_B) * 100
      const dy = ((e.clientY - d.y) / VOORBEELD_H) * 100
      setOffsetX(Math.round(klem(d.ox + dx, -OFFSET_BEREIK, OFFSET_BEREIK)))
      setOffsetY(Math.round(klem(d.oy + dy, -OFFSET_BEREIK, OFFSET_BEREIK)))
    },
    [setOffsetX, setOffsetY],
  )

  const opLos = useCallback(() => {
    sleep.current = null
  }, [])

  const herstel = useCallback(() => {
    setZoom(1)
    setOffsetX(0)
    setOffsetY(0)
    setRotatie(0)
  }, [setZoom, setOffsetX, setOffsetY, setRotatie])

  const beeldStijl = uitsnedeStijl({ zoom: z, offsetX: ox, offsetY: oy, rotatie: rot })
  const tegelKleur = achtergrond === 'wit' ? '#fff' : achtergrond === 'geen' ? 'transparent' : '#0b0e12'

  return (
    <div className="field-type" style={{ marginBottom: 20 }}>
      <label className="field-label">Beeld bijsnijden &amp; voorvertoning</label>
      <p style={{ fontSize: 13, color: 'var(--theme-elevation-500)', margin: '0 0 10px' }}>
        Zoom, versleep en draai tot de reclame recht en vol in de balk staat. Dit is exact de tegel
        die op het kantinescherm voorbijschuift.
      </p>

      {url ? (
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div
            onPointerDown={opNeer}
            onPointerMove={opBeweeg}
            onPointerUp={opLos}
            onPointerCancel={opLos}
            style={{
              width: VOORBEELD_B,
              height: VOORBEELD_H,
              borderRadius: 12,
              overflow: 'hidden',
              background: tegelKleur,
              border: '1px solid var(--theme-elevation-200)',
              boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
              cursor: 'grab',
              touchAction: 'none',
              flexShrink: 0,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="Voorvertoning van de reclametegel"
              draggable={false}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                padding: 8,
                ...beeldStijl,
                pointerEvents: 'none',
                userSelect: 'none',
              }}
            />
          </div>

          <div style={{ flex: 1, minWidth: 240 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              Zoom: {z.toFixed(2)}×
            </label>
            <input
              type="range"
              min={ZOOM_MIN}
              max={ZOOM_MAX}
              step={0.05}
              value={z}
              onChange={(e) => setZoom(Number(e.target.value))}
              style={{ width: '100%' }}
            />

            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, margin: '14px 0 4px' }}>
              Draaien: {rot}°
            </label>
            <input
              type="range"
              min={-ROTATIE_BEREIK}
              max={ROTATIE_BEREIK}
              step={1}
              value={rot}
              onChange={(e) => setRotatie(Number(e.target.value))}
              style={{ width: '100%' }}
            />
            {/* Een scheve foto zit meestal binnen een paar graden; kwartslagen zijn voor een beeld
                dat liggend gefotografeerd werd. */}
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {[-90, -1, +1, +90].map((stap) => (
                <button
                  key={stap}
                  type="button"
                  className="btn btn--style-secondary btn--size-small"
                  onClick={() => setRotatie(Math.round(klem(rot + stap, -ROTATIE_BEREIK, ROTATIE_BEREIK)))}
                >
                  {stap > 0 ? `+${stap}°` : `${stap}°`}
                </button>
              ))}
              <button type="button" className="btn btn--style-secondary btn--size-small" onClick={herstel}>
                Herstellen
              </button>
            </div>

            <p style={{ fontSize: 12, color: 'var(--theme-elevation-450)', marginTop: 10 }}>
              Versleep het beeld in de tegel om het te positioneren.
            </p>
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--theme-elevation-450)' }}>
          Kies eerst een afbeelding hierboven — dan verschijnt hier de voorvertoning.
        </p>
      )}
    </div>
  )
}
