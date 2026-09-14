'use client'

import { useState } from 'react'

import { DownloadImageButton } from '@/components/DownloadImageButton'
import './winfie-card.css'

export function WinfieCard({ matchId }: { matchId: number }) {
  const downloadSrc = `/api/match/${matchId}/winfie?download=1`
  const [attempt, setAttempt] = useState(0)
  const [previewFailed, setPreviewFailed] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [actionError, setActionError] = useState('')
  const previewSrc = `/api/match/${matchId}/winfie?preview=1&attempt=${attempt}`

  const share = async () => {
    setSharing(true)
    setActionError('')
    try {
      const response = await fetch(downloadSrc, { cache: 'no-store' })
      if (!response.ok) throw new Error('De afbeelding kon niet worden gemaakt.')
      const blob = await response.blob()
      const file = new File([blob], `winfie-wedstrijd-${matchId}.png`, { type: 'image/png' })
      const shareData = { files: [file], title: 'Mijn Winfie · Krachtbal Live' }

      if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
        await navigator.share(shareData)
        return
      }

      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = file.name
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setActionError(error instanceof Error ? error.message : 'Delen lukte niet. Probeer opnieuw.')
    } finally {
      setSharing(false)
    }
  }

  return (
    <section className="winfie-card" aria-labelledby="winfie-title">
      <div className="winfie-copy">
        <span className="winfie-kicker">JOUW WEDSTRIJD · JOUW MOMENT</span>
        <h2 id="winfie-title">Deel jullie Winfie</h2>
        <p>
          Een afgewerkte Story met clublogo’s, eindstand, scoreverloop en de kleuren van
          de winnaar. Jouw eigen tribunefoto krijgt automatisch een plek.
        </p>
        <div className="winfie-actions">
          <button type="button" className="btn btn-primary winfie-share" onClick={share} disabled={sharing}>
            {sharing ? 'Winfie maken…' : '↗ Deel Winfie'}
          </button>
          <DownloadImageButton
            className="btn btn-ghost winfie-download"
            href={downloadSrc}
            filename={`winfie-wedstrijd-${matchId}.png`}
          >
            ↓ Download
          </DownloadImageButton>
        </div>
        {actionError ? <span className="download-image-error" role="alert">{actionError}</span> : null}
        <small>Instagram Story · 1080 × 1920 px</small>
      </div>
      {previewFailed ? (
        <div className="winfie-preview-error" role="status">
          <span aria-hidden>🏆</span>
          <strong>De voorvertoning is tijdelijk niet beschikbaar</strong>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setPreviewFailed(false)
              setAttempt((value) => value + 1)
            }}
          >
            Opnieuw laden
          </button>
        </div>
      ) : (
        <a className="winfie-preview" href={previewSrc} target="_blank" rel="noreferrer" aria-label="Bekijk de Winfie op ware grootte">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewSrc}
            alt="Voorvertoning van de Winfie van deze wedstrijd"
            loading="eager"
            onLoad={() => setPreviewFailed(false)}
            onError={() => setPreviewFailed(true)}
          />
          <span>Bekijk groot ↗</span>
        </a>
      )}
    </section>
  )
}
