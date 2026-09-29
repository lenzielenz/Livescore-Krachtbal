'use client'

import { useRef, useState } from 'react'

import './photo-tribune.css'

export type Instant = { id: number; url: string; authorName: string; at: number; kind?: 'photo' | 'video' }

const MAX_VIDEO_MB = 30

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
  showButton = canPost,
  live = false,
  mineIds,
  onLocalAdd,
  onLocalRemove,
}: {
  matchId: number
  instants: Instant[]
  /** Mag deze bezoeker écht posten (ingelogd + venster open)? Bepaalt wat er gebeurt bij een tik. */
  canPost: boolean
  /** Staat het foto-venster open (tijdstip/reeks), los van of de bezoeker al ingelogd is? De knop
      blijft dan altijd zichtbaar — een niet-ingelogde bezoeker krijgt bij een tik een inlog-uitnodiging
      i.p.v. dat de knop gewoon verdwijnt (dat maakte het inconsistent: soms wel, soms geen knop). */
  showButton?: boolean
  /** De wedstrijd is nu live — dan mag de foto-knop opvallen i.p.v. rustig te wachten tot iemand
      'm toevallig opmerkt. */
  live?: boolean
  mineIds: Set<number>
  onLocalAdd: (i: Instant) => void
  onLocalRemove: (id: number) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [zoom, setZoom] = useState<Instant | null>(null)

  const tap = () => {
    if (!canPost) {
      window.location.href = `/inloggen?next=/match/${matchId}`
      return
    }
    inputRef.current?.click()
  }

  const tapVideo = () => {
    if (!canPost) {
      window.location.href = `/inloggen?next=/match/${matchId}`
      return
    }
    videoInputRef.current?.click()
  }

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

  const pickVideo = async (file: File | null) => {
    if (!file || busy) return
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      setErr(`Video te groot (max ${MAX_VIDEO_MB} MB) — neem een kortere clip.`)
      setTimeout(() => setErr(null), 3500)
      if (videoInputRef.current) videoInputRef.current.value = ''
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const fd = new FormData()
      fd.append('video', file)
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
      if (videoInputRef.current) videoInputRef.current.value = ''
    }
  }

  const remove = async (id: number) => {
    onLocalRemove(id) // optimistisch
    setZoom(null)
    await fetch(`/api/match/${matchId}/instant/${id}`, { method: 'DELETE' }).catch(() => {})
  }

  if (!showButton && instants.length === 0) return null

  return (
    <div className="ptr">
      {/* Geen kop/info. Nog geen foto's → één nette knop op volle breedte (uitgelijnd met de rest).
          Zodra er foto's zijn → horizontale strip met compacte knop + kleine thumbnails. De knop
          zelf blijft altijd staan zolang het venster open is — niet ingelogd tikt naar een
          inlog-uitnodiging (zie tap()) i.p.v. dat de knop wisselend verdwijnt. */}
      {instants.length === 0 ? (
        showButton && (
          <div className="ptr-fullrow">
            <button
              type="button"
              className={`ptr-fullbtn${live ? ' live' : ''}`}
              onClick={tap}
              disabled={busy}
            >
              {busy ? '⏳ Bezig…' : live ? '📸 Jij was erbij — deel een foto!' : '📸 Foto toevoegen'}
            </button>
            <button type="button" className="ptr-fullbtn ptr-fullbtn-video" onClick={tapVideo} disabled={busy}>
              🎥 Video toevoegen
            </button>
          </div>
        )
      ) : (
        <>
          <p className="ptr-count">📷 {instants.length} {instants.length === 1 ? 'moment' : 'momenten'} van deze wedstrijd</p>
          <div className="ptr-strip">
            {showButton && (
              <>
                <button
                  type="button"
                  className={`ptr-add${live ? ' live' : ''}`}
                  onClick={tap}
                  disabled={busy}
                  aria-label="Foto toevoegen"
                >
                  <span className="ptr-add-ico" aria-hidden>{busy ? '⏳' : '📸'}</span>
                  <span className="ptr-add-lbl">{busy ? 'Bezig…' : 'Foto'}</span>
                </button>
                <button
                  type="button"
                  className={`ptr-add${live ? ' live' : ''}`}
                  onClick={tapVideo}
                  disabled={busy}
                  aria-label="Video toevoegen"
                >
                  <span className="ptr-add-ico" aria-hidden>{busy ? '⏳' : '🎥'}</span>
                  <span className="ptr-add-lbl">{busy ? 'Bezig…' : 'Video'}</span>
                </button>
              </>
            )}
            {instants.map((i) => (
              <button type="button" key={i.id} className="ptr-thumb" onClick={() => setZoom(i)} aria-label={i.kind === 'video' ? `Video van ${i.authorName}` : `Foto van ${i.authorName}`}>
                {i.kind === 'video' ? (
                  <>
                    <video src={i.url} muted playsInline preload="metadata" />
                    <span className="ptr-thumb-play" aria-hidden>▶</span>
                  </>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={i.url} alt={`Foto van ${i.authorName}`} loading="lazy" />
                )}
                <span className="ptr-thumb-name">{i.authorName}</span>
              </button>
            ))}
          </div>
        </>
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
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        capture="environment"
        hidden
        onChange={(e) => pickVideo(e.target.files?.[0] ?? null)}
      />

      {zoom && (
        <div className="ptr-lightbox" role="dialog" aria-modal="true" onClick={() => setZoom(null)}>
          <div className="ptr-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            {zoom.kind === 'video' ? (
              <video src={zoom.url} controls autoPlay playsInline />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={zoom.url} alt={`Foto van ${zoom.authorName}`} />
            )}
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
