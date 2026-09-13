'use client'

import { useState } from 'react'

type Category = 'idea' | 'change' | 'problem'

export function IdeasForm() {
  const [category, setCategory] = useState<Category>('idea')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    setBusy(true)
    setError('')
    const form = new FormData(formElement)
    const body = {
      category,
      subject: form.get('subject'),
      message: form.get('message'),
      name: form.get('name'),
      email: form.get('email'),
      website: form.get('website'),
      pageUrl: window.location.href,
    }
    try {
      const response = await fetch('/api/ideeenbus', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(data.error || 'Versturen is niet gelukt.')
      formElement.reset()
      setCategory('idea')
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
