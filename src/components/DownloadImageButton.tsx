'use client'

import { useState, type ReactNode } from 'react'

export function DownloadImageButton({
  href,
  filename,
  className,
  children,
}: {
  href: string
  filename: string
  className?: string
  children: ReactNode
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function download() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(href, { credentials: 'include' })
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error || 'Download kon niet worden gemaakt.')
      }
      const blob = await response.blob()
      if (!blob.type.startsWith('image/')) throw new Error('De server gaf geen geldige afbeelding terug.')
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Download is mislukt. Probeer opnieuw.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className={className} disabled={busy} onClick={() => void download()}>
        {busy ? 'Afbeelding maken…' : children}
      </button>
      {error && <span className="download-image-error" role="alert">{error}</span>}
    </>
  )
}
