'use client'

import { useState } from 'react'

export function InstagramRecapCard({ period }: { period: string }) {
  const [retry, setRetry] = useState(0)
  const [previewFailed, setPreviewFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const src = `/api/recap/instagram?preview=1&v=${retry}`

  async function downloadOrShare() {
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/recap/instagram?download=1', { cache: 'no-store' })
      if (!response.ok) throw new Error('De Story kon niet worden gemaakt.')
      const blob = await response.blob()
      const file = new File([blob], 'weekend-recap.png', { type: 'image/png' })
      if (typeof navigator.share === 'function' && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: 'Krachtbal Live weekendrecap', text: 'Het weekend in één Story', files: [file] })
      } else {
        const url = URL.createObjectURL(blob); const link = document.createElement('a')
        link.href = url; link.download = file.name; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url)
      }
    } catch (cause) {
      if (!(cause instanceof DOMException && (cause.name === 'AbortError' || cause.name === 'NotAllowedError'))) setError(cause instanceof Error ? cause.message : 'Probeer opnieuw.')
    } finally { setBusy(false) }
  }

  return <section className="recap-story-card" aria-labelledby="recap-story-title">
    <div className="recap-story-copy">
      <p className="recap-eyebrow">KLAAR OM TE DELEN</p>
      <h2 id="recap-story-title">Het weekend in één Story</h2>
      <p>Een professionele 9:16-samenvatting met scores, statistieken en topprestaties. Gemaakt om meteen als screenshot of Instagram Story te delen.</p>
      <div className="recap-story-actions">
        <button type="button" className="recap-primary-action" onClick={downloadOrShare} disabled={busy}>{busy ? 'Bezig…' : '↗ Deel Story'}</button>
        <a className="recap-secondary-action" href="/api/recap/instagram?download=1" download="weekend-recap.png">↓ Download PNG</a>
      </div>
      {error && <p className="recap-story-error" role="alert">{error}</p>}
      <small>Instagram Story · 1080 × 1920 px · één beeld</small>
    </div>
    <div className="recap-story-preview">
      {previewFailed ? (
        <>
          <p className="recap-story-error" role="status">De voorvertoning kon niet laden. Probeer het opnieuw.</p>
          <button type="button" className="recap-preview-retry" onClick={() => {
            setPreviewFailed(false)
            setRetry((value) => value + 1)
          }}>Opnieuw laden</button>
        </>
      ) : (
        <img src={src} alt={`Voorvertoning van de weekendrecap: ${period}`} onError={() => setPreviewFailed(true)} />
      )}
    </div>
  </section>
}
