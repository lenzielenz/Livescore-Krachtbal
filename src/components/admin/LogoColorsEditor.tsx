'use client'

import { useField, useFormFields } from '@payloadcms/ui'
import type { TextFieldClientComponent } from 'payload'
import { useCallback, useEffect, useRef, useState } from 'react'

import { colorsFromPixels, normalizeHex } from '@/lib/club-colors'

// Aangepaste Field-component op het Club-formulier. Leidt automatisch twee clubkleuren
// uit het logo af (op een canvas in de browser) en laat de beheerder ze handmatig
// bijstellen met kleurkiezers. Op deze kleuren bouwen de live-weergaven hun stijl:
// de thuisploeg geeft de toon aan, maar als de tegenpartij scoort komen hún kleuren boven.
const SAMPLE_PX = 72

function useLogoUrl(): string | null {
  const logoValue = useFormFields(([fields]) => fields?.logo?.value)
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const id =
      logoValue && typeof logoValue === 'object' && 'id' in logoValue
        ? (logoValue as { id: number }).id
        : logoValue
    if (id === null || id === undefined || id === '') {
      setUrl(null)
      return
    }
    if (logoValue && typeof logoValue === 'object' && 'url' in logoValue && typeof (logoValue as { url?: string }).url === 'string') {
      setUrl((logoValue as { url: string }).url)
      return
    }
    let cancelled = false
    fetch(`/api/media/${id}?depth=0`)
      .then((r) => (r.ok ? r.json() : null))
      .then((doc) => {
        if (!cancelled) setUrl(doc && typeof doc.url === 'string' ? doc.url : null)
      })
      .catch(() => {
        if (!cancelled) setUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [logoValue])

  return url
}

export const LogoColorsEditor: TextFieldClientComponent = ({ path }) => {
  const { value: primary, setValue: setPrimary } = useField<string>({ path })
  const { value: secondary, setValue: setSecondary } = useField<string>({ path: 'colorSecondary' })
  const url = useLogoUrl()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoTriedFor = useRef<string | null>(null)

  const p = normalizeHex(primary) ?? '#06d6a0'
  const s = normalizeHex(secondary) ?? '#4cc9f0'

  const extract = useCallback(async () => {
    if (!url) return
    setBusy(true)
    setError(null)
    try {
      const colors = await new Promise<ReturnType<typeof colorsFromPixels>>((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas')
            canvas.width = SAMPLE_PX
            canvas.height = SAMPLE_PX
            const ctx = canvas.getContext('2d', { willReadFrequently: true })
            if (!ctx) return reject(new Error('geen canvas'))
            ctx.drawImage(img, 0, 0, SAMPLE_PX, SAMPLE_PX)
            const { data } = ctx.getImageData(0, 0, SAMPLE_PX, SAMPLE_PX)
            resolve(colorsFromPixels(data))
          } catch (err) {
            reject(err instanceof Error ? err : new Error('analyse mislukt'))
          }
        }
        img.onerror = () => reject(new Error('logo kon niet geladen worden'))
        img.src = url
      })
      if (colors) {
        setPrimary(colors.primary)
        setSecondary(colors.secondary)
      } else {
        setError('Geen duidelijke kleuren in het logo gevonden — stel ze handmatig in.')
      }
    } catch {
      setError('Kleuren uit het logo halen lukte niet — stel ze handmatig in.')
    } finally {
      setBusy(false)
    }
  }, [url, setPrimary, setSecondary])

  // Automatisch afleiden zodra er een logo is en er nog geen kleuren ingesteld zijn.
  useEffect(() => {
    if (!url) return
    if (normalizeHex(primary)) return
    if (autoTriedFor.current === url) return
    autoTriedFor.current = url
    void extract()
  }, [url, primary, extract])

  return (
    <div className="field-type" style={{ marginBottom: 20 }}>
      <label className="field-label">Clubkleuren</label>
      <p style={{ fontSize: 13, color: 'var(--theme-elevation-500)', margin: '0 0 12px' }}>
        Twee kleuren waarop de live-schermen hun stijl bouwen. Automatisch uit het logo gehaald —
        pas ze hieronder gerust handmatig aan.
      </p>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <Swatch label="Primair" value={p} onChange={(v) => setPrimary(v)} />
          <Swatch label="Secundair" value={s} onChange={(v) => setSecondary(v)} />
        </div>

        <div style={{ flex: 1, minWidth: 220 }}>
          {/* Live-voorvertoning: zo kleurt het scherm van de thuisploeg. */}
          <ThemePreview primary={p} secondary={s} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              type="button"
              className="btn btn--style-secondary btn--size-small"
              onClick={() => void extract()}
              disabled={!url || busy}
            >
              {busy ? 'Bezig…' : '🎨 Kleuren uit logo halen'}
            </button>
          </div>
          {!url && (
            <p style={{ fontSize: 12, color: 'var(--theme-elevation-450)', marginTop: 8 }}>
              Upload eerst een logo om de kleuren automatisch af te leiden.
            </p>
          )}
          {error && <p style={{ fontSize: 12, color: 'var(--theme-error-500, #c0392b)', marginTop: 8 }}>{error}</p>}
        </div>
      </div>
    </div>
  )
}

function Swatch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600 }}>
      {label}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 44, height: 44, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => {
            const n = normalizeHex(e.target.value)
            onChange(n ?? e.target.value)
          }}
          style={{
            width: 86,
            fontFamily: 'monospace',
            fontSize: 13,
            padding: '6px 8px',
            borderRadius: 4,
            border: '1px solid var(--theme-elevation-200)',
            background: 'var(--theme-input-bg, #fff)',
            color: 'var(--theme-elevation-800)',
          }}
        />
      </span>
    </label>
  )
}

function ThemePreview({ primary, secondary }: { primary: string; secondary: string }) {
  return (
    <div
      style={{
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid var(--theme-elevation-200)',
        background: `radial-gradient(circle at 30% 0%, color-mix(in srgb, ${primary} 38%, #06140d), #06140d)`,
        padding: '16px 18px',
        color: '#e8f5ee',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 14, height: 14, borderRadius: '50%', background: primary, boxShadow: `0 0 12px ${primary}` }} />
        <span style={{ fontWeight: 800, letterSpacing: '0.04em', color: secondary }}>LIVE</span>
        <span style={{ marginLeft: 'auto', fontWeight: 900, fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>
          2 <span style={{ opacity: 0.5 }}>–</span> 1
        </span>
      </div>
      <div style={{ marginTop: 10, height: 4, borderRadius: 4, background: `linear-gradient(90deg, ${primary}, ${secondary})` }} />
    </div>
  )
}
