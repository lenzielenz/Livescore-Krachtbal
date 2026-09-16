'use client'

import { useRef, useState } from 'react'

type Category = 'idea' | 'change' | 'problem'

// Screenshot client-side verkleinen vóór upload — zelfde aanpak als de foto-tribune
// (PhotoTribune.tsx): scheelt data en houdt de opslag klein. Iets hogere resolutie dan een
// tribunefoto, want een screenshot van een probleem moet leesbaar blijven.
async function resizeScreenshot(file: File, max = 1600, quality = 0.85): Promise<Blob> {
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

export function IdeasForm() {
  const [category, setCategory] = useState<Category>('idea')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [screenshotPreview, setScreenshotPreview] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function pickScreenshot(file: File | null) {
    setScreenshot(file)
    setScreenshotPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return file ? URL.createObjectURL(file) : ''
    })
  }

  function clearScreenshot() {
    pickScreenshot(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    setBusy(true)
    setError('')
    const form = new FormData(formElement)
    const body = new FormData()
    body.set('category', category)
    body.set('subject', String(form.get('subject') ?? ''))
    body.set('message', String(form.get('message') ?? ''))
    body.set('name', String(form.get('name') ?? ''))
    body.set('email', String(form.get('email') ?? ''))
    body.set('website', String(form.get('website') ?? ''))
    body.set('pageUrl', window.location.href)
    try {
      if (screenshot) {
        const blob = await resizeScreenshot(screenshot)
        body.set('screenshot', new File([blob], 'screenshot.jpg', { type: 'image/jpeg' }))
      }
      const response = await fetch('/api/ideeenbus', {
        method: 'POST',
        credentials: 'include',
        body,
      })
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(data.error || 'Versturen is niet gelukt.')
      formElement.reset()
      setCategory('idea')
      clearScreenshot()
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Versturen is niet gelukt.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <section className="ideas-thanks" role="status">
        <span aria-hidden>✓</span>
        <h2>Bedankt voor je idee!</h2>
        <p>Je inzending staat bij de beheerder. Zo bouwen we Krachtbal Live samen verder.</p>
        <button type="button" className="btn btn-ghost" onClick={() => setDone(false)}>Nog iets doorgeven</button>
      </section>
    )
  }

  return (
    <form className="ideas-form" onSubmit={submit}>
      <fieldset>
        <legend>Wat wil je doorgeven?</legend>
        <div className="ideas-types">
          {([
            ['idea', '✨', 'Nieuw idee'],
            ['change', '🛠️', 'Aanpassing'],
            ['problem', '🐞', 'Probleem'],
          ] as const).map(([value, icon, label]) => (
            <button
              key={value}
              type="button"
              className={category === value ? 'selected' : ''}
              aria-pressed={category === value}
              onClick={() => setCategory(value)}
            >
              <span aria-hidden>{icon}</span>{label}
            </button>
          ))}
        </div>
      </fieldset>

      <label>
        <span>Onderwerp</span>
        <input name="subject" required minLength={3} maxLength={100} placeholder="Kort en duidelijk" />
      </label>
      <label>
        <span>Vertel wat je bedoelt</span>
        <textarea name="message" required minLength={10} maxLength={3000} rows={7} placeholder="Wat wil je graag zien en waarom zou dit helpen?" />
      </label>
      <label className="ideas-screenshot-picker">
        <span>Screenshot <small>optioneel — handig bij een probleem</small></span>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => pickScreenshot(e.target.files?.[0] ?? null)}
        />
      </label>
      {screenshotPreview && (
        <div className="ideas-screenshot-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={screenshotPreview} alt="Voorvertoning van je screenshot" />
          <button type="button" className="btn btn-ghost" onClick={clearScreenshot}>Verwijderen</button>
        </div>
      )}
      <div className="ideas-contact">
        <label><span>Naam <small>optioneel</small></span><input name="name" maxLength={100} autoComplete="name" /></label>
        <label><span>E-mail <small>optioneel</small></span><input name="email" type="email" maxLength={180} autoComplete="email" /></label>
      </div>
      <label className="ideas-honey" aria-hidden>
        Website<input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      {error && <p className="ideas-error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary ideas-submit" disabled={busy}>
        {busy ? 'Versturen…' : 'Verstuur naar de ideeënbus →'}
      </button>
      <p className="ideas-note">Contactgegevens zijn alleen nodig als je graag een antwoord wilt.</p>
    </form>
  )
}
