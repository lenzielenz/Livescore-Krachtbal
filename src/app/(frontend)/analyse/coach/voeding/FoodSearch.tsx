'use client'

import { useEffect, useRef, useState } from 'react'

import { productByBarcode, scalePer100, searchFoods, type OffFood } from '@/lib/openfoodfacts'

// Voeding opzoeken (op naam of via streepjescode) bij Open Food Facts en toevoegen aan de tracker.
// Barcode-scannen gebruikt de ingebouwde BarcodeDetector (Android Chrome); waar dat niet kan, typ je
// de streepjescode gewoon in. Alles client-side → onafhankelijk van het server-netwerk.

type DetectedBarcode = { rawValue: string }
type BarcodeDetectorLike = { detect: (src: CanvasImageSource) => Promise<DetectedBarcode[]> }
type BDCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike
const getBD = (): BDCtor | undefined =>
  typeof window !== 'undefined' ? (window as unknown as { BarcodeDetector?: BDCtor }).BarcodeDetector : undefined

export function FoodSearch({ onAdd, onClose }: { onAdd: (e: { name: string; kcal: number; p: number; c: number; f: number }) => void; onClose: () => void }) {
  const [tab, setTab] = useState<'search' | 'scan'>('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<OffFood[]>([])
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState<string | null>(null)
  const [selected, setSelected] = useState<OffFood | null>(null)
  const [grams, setGrams] = useState('100')
  const [manualCode, setManualCode] = useState('')
  const [scanMsg, setScanMsg] = useState<string | null>(null)
  const [scanBusy, setScanBusy] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Debounced zoeken op naam.
  useEffect(() => {
    if (tab !== 'search' || selected) return
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      setSearching(true)
      setSearchErr(null)
      searchFoods(q, ctrl.signal)
        .then((r) => setResults(r))
        .catch((e) => {
          if ((e as Error).name !== 'AbortError') setSearchErr('Zoeken lukt even niet — probeer opnieuw.')
        })
        .finally(() => setSearching(false))
    }, 400)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [query, tab, selected])

  // Camera + barcode-detectie (indien ondersteund).
  useEffect(() => {
    if (tab !== 'scan' || selected) return
    const BD = getBD()
    if (!BD) {
      setScanMsg('Scannen wordt door deze browser niet ondersteund — typ de streepjescode hieronder.')
      return
    }
    let stream: MediaStream | null = null
    let iv: ReturnType<typeof setInterval> | null = null
    let stopped = false
    const detector = new BD({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] })
    setScanMsg('Richt op de streepjescode…')
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        if (stopped) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        const v = videoRef.current
        if (v) {
          v.srcObject = s
          void v.play().catch(() => {})
        }
        iv = setInterval(async () => {
          const vid = videoRef.current
          if (!vid || vid.readyState < 2) return
          try {
            const codes = await detector.detect(vid)
            if (codes.length > 0 && codes[0].rawValue) {
              const code = codes[0].rawValue
              if (iv) clearInterval(iv)
              iv = null
              void lookupBarcode(code)
            }
          } catch {
            /* detectie-hapering → volgende tik */
          }
        }, 450)
      })
      .catch(() => setScanMsg('Geen toegang tot de camera — typ de streepjescode hieronder.'))
    return () => {
      stopped = true
      if (iv) clearInterval(iv)
      if (stream) stream.getTracks().forEach((t) => t.stop())
    }
  }, [tab, selected])

  const lookupBarcode = async (code: string) => {
    setScanBusy(true)
    setScanMsg('Product opzoeken…')
    try {
      const f = await productByBarcode(code)
      if (f) {
        setGrams(String(f.servingGrams || 100))
        setSelected(f)
      } else {
        setScanMsg(`Geen product gevonden voor ${code}. Probeer opnieuw of voeg handmatig toe.`)
      }
    } catch {
      setScanMsg('Opzoeken lukt even niet — probeer opnieuw.')
    } finally {
      setScanBusy(false)
    }
  }

  const pick = (f: OffFood) => {
    setGrams(String(f.servingGrams || 100))
    setSelected(f)
  }

  const preview = selected ? scalePer100(selected.per100, Math.max(1, Number(grams) || 100)) : null
  const addSelected = () => {
    if (!selected || !preview) return
    const g = Math.max(1, Number(grams) || 100)
    const label = selected.brand ? `${selected.name} · ${selected.brand}` : selected.name
    onAdd({ name: `${label} (${g} g)`, kcal: preview.kcal, p: preview.p, c: preview.c, f: preview.f })
    onClose()
  }

  return (
    <div className="fsx" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="fsx-panel" onClick={(e) => e.stopPropagation()}>
        <div className="fsx-head">
          <div className="fsx-tabs">
            <button type="button" className={tab === 'search' ? 'on' : ''} onClick={() => { setTab('search'); setSelected(null) }}>🔎 Zoeken</button>
            <button type="button" className={tab === 'scan' ? 'on' : ''} onClick={() => { setTab('scan'); setSelected(null) }}>📷 Scannen</button>
          </div>
          <button type="button" className="fsx-close" onClick={onClose} aria-label="Sluiten">✕</button>
        </div>

        {selected ? (
          <div className="fsx-portion">
            <div className="fsx-portion-name">{selected.name}{selected.brand ? ` · ${selected.brand}` : ''}</div>
            <div className="fsx-portion-per100">{selected.per100.kcal} kcal / 100 g · E {selected.per100.p}g · K {selected.per100.c}g · V {selected.per100.f}g</div>
            <label className="fsx-portion-grams">
              Hoeveelheid
              <span><input type="number" inputMode="numeric" value={grams} min={1} onChange={(e) => setGrams(e.target.value)} /> g</span>
            </label>
            <div className="fsx-portion-preview">
              <b>{preview?.kcal} kcal</b>
              <span>E {preview?.p}g · K {preview?.c}g · V {preview?.f}g</span>
            </div>
            <div className="fsx-portion-acts">
              <button type="button" className="fsx-back" onClick={() => setSelected(null)}>← Terug</button>
              <button type="button" className="fsx-add" onClick={addSelected}>+ Toevoegen</button>
            </div>
          </div>
        ) : tab === 'search' ? (
          <div className="fsx-search">
            <input className="fsx-input" type="search" placeholder="Zoek een voedingsmiddel…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
            {searching && <p className="fsx-note">Zoeken…</p>}
            {searchErr && <p className="fsx-note err">{searchErr}</p>}
            {!searching && query.trim().length >= 2 && results.length === 0 && !searchErr && <p className="fsx-note">Niets gevonden.</p>}
            <ul className="fsx-results">
              {results.map((f) => (
                <li key={f.id}>
                  <button type="button" onClick={() => pick(f)}>
                    <span className="fsx-r-name">{f.name}{f.brand ? <i> · {f.brand}</i> : null}</span>
                    <span className="fsx-r-kcal">{f.per100.kcal}<small> kcal/100g</small></span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="fsx-credit">Gegevens: Open Food Facts</p>
          </div>
        ) : (
          <div className="fsx-scan">
            <div className="fsx-cam">
              <video ref={videoRef} muted playsInline />
              <div className="fsx-cam-line" aria-hidden />
            </div>
            {scanMsg && <p className="fsx-note">{scanMsg}</p>}
            <form
              className="fsx-manual"
              onSubmit={(e) => {
                e.preventDefault()
                if (manualCode.trim()) void lookupBarcode(manualCode.trim())
              }}
            >
              <input className="fsx-input" type="text" inputMode="numeric" placeholder="Streepjescode intypen…" value={manualCode} onChange={(e) => setManualCode(e.target.value)} />
              <button type="submit" className="fsx-add" disabled={scanBusy}>Zoek</button>
            </form>
            <p className="fsx-credit">Gegevens: Open Food Facts</p>
          </div>
        )}
      </div>
    </div>
  )
}
