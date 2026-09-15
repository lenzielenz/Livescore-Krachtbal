'use client'

import { useEffect, useState } from 'react'

import { svgToPngBlob } from '@/lib/svg-to-png'
import './instagram-weekend-card.css'

// Download gebeurt volledig client-side (fetch de SVG → teken op canvas → PNG-blob): de server
// levert enkel nog SVG. Zie svg-to-png.ts voor waarom — dit is de fix voor de productie-storing
// van 15/09, waarbij de server-side PNG-rasterisatie (sharp + tekst-SVG) de hele site meesleurde.
export function InstagramWeekendCard() {
  const [page, setPage] = useState(0)
  const [pages, setPages] = useState(1)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/club/instagram-weekend?meta=1', { signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (Number.isInteger(data?.pages) && data.pages > 0) setPages(data.pages) })
      .catch(() => {})
    return () => controller.abort()
  }, [])
  const [attempt, setAttempt] = useState(0)
  const [previewFailed, setPreviewFailed] = useState(false)
  const previewSrc = `/api/club/instagram-weekend?preview=1&page=${page}&attempt=${attempt}`
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')

  const download = async () => {
    setDownloading(true)
    setDownloadError('')
    try {
      const res = await fetch(`/api/club/instagram-weekend?preview=1&page=${page}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('De Story kon niet worden opgehaald.')
      const svgText = await res.text()
      const blob = await svgToPngBlob(svgText, 1080, 1920)
      const filename = `mijn-club-weekendplan-${page + 1}.png`
      const file = new File([blob], filename, { type: 'image/png' })
      const shareData = { files: [file], title: 'Ons weekendplan · Krachtbal Live' }

      if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
        await navigator.share(shareData)
        return
      }

      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setDownloadError(error instanceof Error ? error.message : 'Downloaden lukte niet. Probeer opnieuw.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <section className="ig-weekend" aria-labelledby="ig-weekend-title">
      <div className="ig-weekend-copy">
        <span className="ig-weekend-kicker">SAMEN LANGS DE ZIJLIJN</span>
        <h2 id="ig-weekend-title">Jullie club. Jullie weekend.</h2>
        <p>Alle ploegen, alle aftrappen. Een deelklare Story in jullie clubkleuren. Download je plan en nodig iedereen uit om mee te supporteren.</p>
        <button type="button" className="btn btn-primary ig-weekend-download" onClick={() => void download()} disabled={downloading}>
          {downloading ? 'Bezig…' : '↓ Download deze Story'}
        </button>
        {downloadError && <span className="download-image-error" role="alert">{downloadError}</span>}
        <small>1080 × 1920 px · klaar voor Instagram</small>
        {pages > 1 && (
          <nav className="ig-weekend-pages" aria-label="Pagina's van je weekendplan">
            <p>Een druk weekend! Download alle {pages} Stories om elke wedstrijd te delen.</p>
            <div>{Array.from({ length: pages }, (_, i) => (
              <button key={i} type="button" aria-pressed={page === i}
                onClick={() => { setPage(i); setPreviewFailed(false) }}>
                Story {i + 1}
              </button>
            ))}</div>
          </nav>
        )}
      </div>
      {previewFailed ? (
        <div className="ig-weekend-preview-error" role="status">
          <span aria-hidden>🖼️</span>
          <strong>Voorvertoning kon niet laden</strong>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setPreviewFailed(false)
              setAttempt((value) => value + 1)
            }}
          >
            Probeer opnieuw
          </button>
        </div>
      ) : (
        <a className="ig-weekend-preview" href={previewSrc} target="_blank" rel="noreferrer" aria-label="Bekijk het weekendplan op ware grootte">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewSrc}
            alt="Voorvertoning van het persoonlijke Instagram-weekendplan van de club"
            onError={() => setPreviewFailed(true)}
          />
        </a>
      )}
    </section>
  )
}
