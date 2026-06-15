'use client'

import { useEffect, useRef, useState } from 'react'

import './photo-tribune.css'

export type Instant = { id: number; url: string; authorName: string; at: number }

// Foto's client-side verkleinen vóór upload — scheelt data en houdt de opslag klein.
async function resize(file: File, max = 1280, quality = 0.82): Promise<Blob> {
  const img = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Geen canvas')
  ctx.drawImage(img, 0, 0, w, h)
  return await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('resize'))), 'image/jpeg', quality),
  )
}

export function PhotoTribune({
  matchId,
  instants,
  canPost,
  mineIds,
  onLocalAdd,
  onLocalRemove,
  momentAt = null,
  onMomentDone,
}: {
  matchId: number
  instants: Instant[]
  canPost: boolean
  mineIds: Set<number>
  onLocalAdd: (i: Instant) => void
  onLocalRemove: (id: number) => void
  // "Samen-foto": gedeeld tijdstip waarop iedereen tegelijk afdrukt (via het live-kanaal).
  momentAt?: number | null
  onMomentDone?: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [zoom, setZoom] = useState<Instant | null>(null)
  const [momentBusy, setMomentBusy] = useState(false)
  // Aftelfase van de samen-foto: 'idle' (geen), 'count' (3·2·1), 'snap' (nu afdrukken).
  const [phase, setPhase] = useState<'idle' | 'count' | 'snap'>('idle')
  const [secs, setSecs] = useState(0)

  // Roep iedereen op om samen een foto te nemen. De aftelklok komt via het live-kanaal terug
  // (ook bij de starter), zodat alle toestellen synchroon lopen.
  const startMoment = async () => {
    if (momentBusy) return
    setMomentBusy(true)
    try {
      await fetch(`/api/match/${matchId}/photomoment`, { method: 'POST' })
    } catch {
      /* stilte: het is een leuk extraatje, geen kritieke actie */
    }
    setTimeout(() => setMomentBusy(false), 8000)
  }

  // Synchrone aftelklok op basis van het gedeelde tijdstip.
  useEffect(() => {
    if (!momentAt) {
      setPhase('idle')
      return
    }
    const tick = () => {
      const ms = momentAt - Date.now()
      if (ms > 0) {
        setPhase('count')
        setSecs(Math.ceil(ms / 1000))
      } else {
        setPhase('snap')
      }
    }
    tick()
    const iv = setInterval(tick, 200)
    const close = setTimeout(() => onMomentDone?.(), Math.max(0, momentAt - Date.now()) + 12_000)
    return () => {
      clearInterval(iv)
      clearTimeout(close)
    }
  }, [momentAt, onMomentDone])

  const pick = async (file: File | null) => {
    if (!file || busy) return
    setBusy(true)
    setErr(null)
    try {
      const blob = await resize(file)
      const fd = new FormData()
      fd.append('photo', new File([blob], 'instant.jpg', { type: 'image/jpeg' }))
      const res = await fetch(`/api/match/${matchId}/instant`, { method: 'POST', body: fd })
      const data = (await res.json().catch(() => ({}))) as { instant?: Instant; error?: string }
      if (res.ok && data.instant) onLocalAdd(data.instant)
      else {
        setErr(data.error || 'Plaatsen mislukt.')
        setTimeout(() => setErr(null), 3500)
      }
    } catch {
      setErr('Plaatsen mislukt — probeer opnieuw.')
      setTimeout(() => setErr(null), 3500)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const remove = async (id: number) => {
    onLocalRemove(id) // optimistisch
    setZoom(null)
    await fetch(`/api/match/${matchId}/instant/${id}`, { method: 'DELETE' }).catch(() => {})
  }

  if (!canPost && instants.length === 0) return null

  return (
    <div className="ptr">
      <div className="ptr-head">
        <h3 className="ptr-title">📸 Foto-tribune</h3>
        <span className="ptr-sub">spontane foto&apos;s · verdwijnen na de wedstrijd</span>
        {canPost && (
          <button type="button" className="ptr-moment-cta" onClick={() => void startMoment()} disabled={momentBusy} title="Roep iedereen op om samen een foto te nemen">
            {momentBusy ? '📸 …' : '📸 Samen-foto'}
          </button>
        )}
      </div>

      {instants.length === 0 ? (
        canPost ? (
          <button type="button" className="ptr-empty-cta" onClick={() => inputRef.current?.click()} disabled={busy}>
            <span className="ptr-empty-ico" aria-hidden>{busy ? '⏳' : '＋'}</span>
            <span className="ptr-empty-txt">
              <span className="ptr-empty-title">{busy ? 'Bezig…' : 'Deel een sfeerbeeld'}</span>
              <span className="ptr-empty-sub">Wees de eerste in de tribune!</span>
            </span>
          </button>
        ) : (
          <p className="ptr-empty">Nog geen foto&apos;s.</p>
        )
      ) : (
        <div className="ptr-strip">
          {canPost && (
            <button type="button" className="ptr-add" onClick={() => inputRef.current?.click()} disabled={busy} aria-label="Foto plaatsen">
              <span className="ptr-add-ico" aria-hidden>{busy ? '⏳' : '＋'}</span>
              <span className="ptr-add-lbl">{busy ? 'Bezig…' : 'Foto'}</span>
            </button>
          )}
          {instants.map((i) => (
            <button type="button" key={i.id} className="ptr-thumb" onClick={() => setZoom(i)} aria-label={`Foto van ${i.authorName}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={i.url} alt={`Foto van ${i.authorName}`} loading="lazy" />
              <span className="ptr-thumb-name">{i.authorName}</span>
            </button>
          ))}
        </div>
      )}
      {err && <p className="ptr-err">{err}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
      />

      {phase !== 'idle' && (
        <div className="ptr-moment" role="dialog" aria-modal="true" onClick={() => onMomentDone?.()}>
          {phase === 'count' ? (
            <>
              <div className="ptr-moment-title">📸 Samen-foto!</div>
              <div key={secs} className="ptr-moment-count">{secs}</div>
              <div className="ptr-moment-sub">Maak je klaar — iedereen tegelijk!</div>
            </>
          ) : (
            <>
              <div className="ptr-moment-title ptr-moment-now">📸 NU!</div>
              {canPost && (
                <button type="button" className="ptr-moment-snap" onClick={(e) => { e.stopPropagation(); inputRef.current?.click() }}>
                  Open camera
                </button>
              )}
              <div className="ptr-moment-sub">Tik om te sluiten</div>
            </>
          )}
        </div>
      )}

      {zoom && (
        <div className="ptr-lightbox" role="dialog" aria-modal="true" onClick={() => setZoom(null)}>
          <div className="ptr-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={zoom.url} alt={`Foto van ${zoom.authorName}`} />
            <div className="ptr-lightbox-bar">
              <span className="ptr-lightbox-name">{zoom.authorName}</span>
              <span className="ptr-lightbox-actions">
                {mineIds.has(zoom.id) && (
                  <button type="button" className="ptr-del" onClick={() => remove(zoom.id)}>Verwijderen</button>
                )}
                <button type="button" className="ptr-close" onClick={() => setZoom(null)}>Sluiten</button>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
