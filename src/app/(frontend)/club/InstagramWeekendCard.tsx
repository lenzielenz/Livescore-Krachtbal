'use client'

import { useEffect, useState } from 'react'

import { DownloadImageButton } from '@/components/DownloadImageButton'
import './instagram-weekend-card.css'

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
  const downloadSrc = `/api/club/instagram-weekend?download=1&page=${page}`
  const [attempt, setAttempt] = useState(0)
  const [previewFailed, setPreviewFailed] = useState(false)
  const previewSrc = `/api/club/instagram-weekend?preview=1&page=${page}&attempt=${attempt}`

  return (
    <section className="ig-weekend" aria-labelledby="ig-weekend-title">
      <div className="ig-weekend-copy">
        <span className="ig-weekend-kicker">SAMEN LANGS DE ZIJLIJN</span>
        <h2 id="ig-weekend-title">Jullie club. Jullie weekend.</h2>
        <p>Alle ploegen, alle aftrappen. Een deelklare Story in jullie clubkleuren. Download je plan en nodig iedereen uit om mee te supporteren.</p>
        <DownloadImageButton
          className="btn btn-primary ig-weekend-download"
          href={downloadSrc}
          filename={`mijn-club-weekendplan-${page + 1}.png`}
        >
          ↓ Download deze Story
        </DownloadImageButton>
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
          {/* De voorvertoning gebruikt lichte SVG; alleen de download maakt de grote PNG. */}
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
