'use client'

import { useRef, useState } from 'react'

import './news-photo-wall.css'

export type NewsPhoto = { id: number; url: string; uploaderName: string; caption: string | null }

const MAX_CAPTION_LEN = 80

// Willekeurige volgorde voor de mozaïek-gallerij — "allemaal door elkaar" i.p.v. netjes op datum,
// zodat de wand elke keer opnieuw een andere mix van sportievelingen toont.
function shuffled<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Herhalend patroon van tegel-groottes voor het mozaïek-effect — sommige foto's springen groter
// uit, andere blijven klein, zonder dat het een saaie uniforme grid wordt.
const MOSAIC_PATTERN = ['npw-m-big', 'npw-m-sm', 'npw-m-sm', 'npw-m-tall', 'npw-m-wide', 'npw-m-sm', 'npw-m-sm', 'npw-m-sm']

// Foto's client-side verkleinen vóór upload — zelfde aanpak als de foto-tribune bij een wedstrijd.
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

// Foto-wand onder een nieuwsbericht (bv. "Dag van de Sportclub"): ingelogde bezoekers voegen een
// eigen foto toe, met een optioneel bijschrift. Dezelfde bouwstenen als de foto-tribune bij een
// wedstrijd (PhotoTribune.tsx) — client-resize, thumbnail-strip, lightbox — maar zonder video en
// met een tussenstap voor het bijschrift.
export function NewsPhotoWall({
  newsId,
  photos,
  canPost,
  showButton = canPost,
  mineIds,
}: {
  newsId: number
  photos: NewsPhoto[]
  /** Mag deze bezoeker écht plaatsen (ingelogd + venster nog open)? */
  canPost: boolean
  /** Staat het venster open, los van of de bezoeker al ingelogd is? De knop blijft dan zichtbaar —
      een niet-ingelogde bezoeker krijgt bij een tik een inlog-uitnodiging i.p.v. dat de knop
      gewoon verdwijnt (zelfde patroon als PhotoTribune bij een wedstrijd). */
  showButton?: boolean
  mineIds: Set<number>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState(photos)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [zoom, setZoom] = useState<NewsPhoto | null>(null)
  const [pending, setPending] = useState<{ blob: Blob; preview: string } | null>(null)
  const [caption, setCaption] = useState('')
  const [mine, setMine] = useState(mineIds)
  const [gallery, setGallery] = useState<NewsPhoto[] | null>(null)

  const tap = () => {
    if (!canPost) {
      window.location.href = `/inloggen?next=/nieuws/${newsId}`
      return
    }
    inputRef.current?.click()
  }

  const pick = async (file: File | null) => {
    if (!file || busy) return
    setErr(null)
    try {
      const blob = await resize(file)
      setPending({ blob, preview: URL.createObjectURL(blob) })
      setCaption('')
    } catch {
      setErr('Foto verwerken mislukt — probeer opnieuw.')
      setTimeout(() => setErr(null), 3500)
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const cancelPending = () => {
    if (pending) URL.revokeObjectURL(pending.preview)
    setPending(null)
    setCaption('')
  }

  const submit = async () => {
    if (!pending || busy) return
    setBusy(true)
    setErr(null)
    try {
      const fd = new FormData()
      fd.append('photo', new File([pending.blob], 'foto.jpg', { type: 'image/jpeg' }))
      if (caption.trim()) fd.append('caption', caption.trim())
      const res = await fetch(`/api/news/${newsId}/photo`, { method: 'POST', body: fd })
      const data = (await res.json().catch(() => ({}))) as { photo?: NewsPhoto; error?: string }
      if (res.ok && data.photo) {
        setItems((cur) => [data.photo as NewsPhoto, ...cur])
        setMine((cur) => new Set(cur).add((data.photo as NewsPhoto).id))
        cancelPending()
      } else {
        setErr(data.error || 'Plaatsen mislukt.')
      }
    } catch {
      setErr('Plaatsen mislukt — probeer opnieuw.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: number) => {
    setItems((cur) => cur.filter((p) => p.id !== id))
    setZoom(null)
    await fetch(`/api/news/${newsId}/photo/${id}`, { method: 'DELETE' }).catch(() => {})
  }

  if (!showButton && items.length === 0) return null

  return (
    <div className="npw">
      <div className="npw-head">
        <p className="npw-count">
          {items.length > 0
            ? `📷 ${items.length} ${items.length === 1 ? 'foto' : "foto's"} van sportievelingen`
            : 'Deel een foto van je sportieveling!'}
        </p>
        {items.length > 1 && (
          <button type="button" className="npw-gallery-btn" onClick={() => setGallery(shuffled(items))}>
            🖼️ Bekijk alle foto's
          </button>
        )}
      </div>
      <div className="npw-strip">
        {showButton && (
          <button type="button" className="npw-add" onClick={tap} disabled={busy} aria-label="Foto toevoegen">
            <span className="npw-add-ico" aria-hidden>📸</span>
            <span className="npw-add-lbl">Foto</span>
          </button>
        )}
        {items.map((p) => (
          <button type="button" key={p.id} className="npw-thumb" onClick={() => setZoom(p)} aria-label={`Foto van ${p.uploaderName}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.caption || `Foto van ${p.uploaderName}`} loading="lazy" />
            <span className="npw-thumb-name">{p.caption || p.uploaderName}</span>
          </button>
        ))}
      </div>
      {err && <p className="npw-err">{err}</p>}
      <input ref={inputRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0] ?? null)} />

      {pending && (
        <div className="npw-compose" role="dialog" aria-modal="true">
          <div className="npw-compose-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pending.preview} alt="Voorbeeld" className="npw-compose-preview" />
            <input
              type="text"
              className="npw-compose-caption"
              placeholder="Bijschrift (optioneel) — bv. naam van je sportieveling"
              value={caption}
              maxLength={MAX_CAPTION_LEN}
              onChange={(e) => setCaption(e.target.value)}
              disabled={busy}
            />
            <div className="npw-compose-actions">
              <button type="button" className="npw-compose-cancel" onClick={cancelPending} disabled={busy}>Annuleren</button>
              <button type="button" className="npw-compose-post" onClick={submit} disabled={busy}>{busy ? 'Bezig…' : 'Plaatsen'}</button>
            </div>
          </div>
        </div>
      )}

      {gallery && (
        <div className="npw-gallery" role="dialog" aria-modal="true" onClick={() => setGallery(null)}>
          <div className="npw-gallery-inner" onClick={(e) => e.stopPropagation()}>
            <div className="npw-gallery-head">
              <span>{gallery.length} foto&apos;s van sportievelingen — allemaal door elkaar</span>
              <button type="button" className="npw-close" onClick={() => setGallery(null)}>Sluiten</button>
            </div>
            <div className="npw-mosaic">
              {gallery.map((p, i) => (
                <button
                  type="button"
                  key={p.id}
                  className={`npw-mosaic-tile ${MOSAIC_PATTERN[i % MOSAIC_PATTERN.length]}`}
                  onClick={() => {
                    setGallery(null)
                    setZoom(p)
                  }}
                  aria-label={`Foto van ${p.uploaderName}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.caption || `Foto van ${p.uploaderName}`} loading="lazy" />
                  {p.caption && <span className="npw-mosaic-cap">{p.caption}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {zoom && (
        <div className="npw-lightbox" role="dialog" aria-modal="true" onClick={() => setZoom(null)}>
          <div className="npw-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={zoom.url} alt={zoom.caption || `Foto van ${zoom.uploaderName}`} />
            <div className="npw-lightbox-bar">
              <span className="npw-lightbox-name">{zoom.caption || zoom.uploaderName}</span>
              <span className="npw-lightbox-actions">
                {mine.has(zoom.id) && (
                  <button type="button" className="npw-del" onClick={() => remove(zoom.id)}>Verwijderen</button>
                )}
                <button type="button" className="npw-close" onClick={() => setZoom(null)}>Sluiten</button>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
