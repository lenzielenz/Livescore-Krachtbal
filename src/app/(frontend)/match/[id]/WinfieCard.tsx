'use client'

import { useState } from 'react'

import { DownloadImageButton } from '@/components/DownloadImageButton'
import './winfie-card.css'

export function WinfieCard({ matchId }: { matchId: number }) {
  const downloadSrc = `/api/match/${matchId}/winfie?download=1`
  const [attempt, setAttempt] = useState(0)
  const [previewFailed, setPreviewFailed] = useState(false)
  const previewSrc = `/api/match/${matchId}/winfie?preview=1&attempt=${attempt}`

  return (
    <section className="winfie-card" aria-labelledby="winfie-title">
      <div className="winfie-copy">
        <span className="winfie-kicker">KLAAR OM TE DELEN</span>
        <h2 id="winfie-title">Download de Winfie</h2>
        <p>
          Eindscore, scoreverloop en de kleuren van de winnaar in één herkenbare Story.
          Heb je zelf een tribunefoto geplaatst? Dan verwerken we die automatisch.
        </p>
        <DownloadImageButton
          className="btn btn-primary winfie-download"
          href={downloadSrc}
          filename={`winfie-wedstrijd-${matchId}.png`}
        >
          ↓ Download Winfie
        </DownloadImageButton>
        <small>1080 × 1920 px · uniek voor deze wedstrijd</small>
      </div>
      {previewFailed ? (
        <div className="winfie-preview-error" role="status">
          <span aria-hidden>🏆</span>
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
        <a className="winfie-preview" href={previewSrc} target="_blank" rel="noreferrer" aria-label="Bekijk de Winfie op ware grootte">
          {/* De preview gebruikt dezelfde PNG-compositie als de download, op halve resolutie. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewSrc} alt="Voorvertoning van de Winfie van deze wedstrijd" loading="lazy" onError={() => setPreviewFailed(true)} />
        </a>
      )}
    </section>
  )
}
