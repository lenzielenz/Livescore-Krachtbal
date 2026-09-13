'use client'

import { useState } from 'react'

import './instagram-weekend-card.css'

export function InstagramWeekendCard() {
  const downloadSrc = '/api/club/instagram-weekend?download=1'
  const [attempt, setAttempt] = useState(0)
  const [previewFailed, setPreviewFailed] = useState(false)
  const previewSrc = `/api/club/instagram-weekend?preview=1&attempt=${attempt}`

  return (
    <section className="ig-weekend" aria-labelledby="ig-weekend-title">
      <div className="ig-weekend-copy">
        <span className="ig-weekend-kicker">SOCIAL MEDIA</span>
        <h2 id="ig-weekend-title">Jouw weekendplan</h2>
        <p>Elke week automatisch gevuld met alle wedstrijden van je club, in jullie eigen kleuren.</p>
        <a className="btn btn-primary ig-weekend-download" href={downloadSrc}>
          ↓ Download Instagram Story
        </a>
        <small>1080 × 1920 px · klaar om te delen</small>
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
