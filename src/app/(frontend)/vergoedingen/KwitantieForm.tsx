'use client'

import { useState } from 'react'

export function KwitantieForm({ officials }: { officials: { id: number; name: string }[] }) {
  const [officialId, setOfficialId] = useState<string>(officials[0] ? String(officials[0].id) : '')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const href = () => {
    const qs = new URLSearchParams()
    if (from) qs.set('from', from)
    if (to) qs.set('to', to)
    const q = qs.toString()
    return `/api/scheidsrechter/${officialId}/kwitantie${q ? `?${q}` : ''}`
  }

  return (
    <section className="wb-card" style={{ maxWidth: 520 }}>
      <h2>Kwitantie scheidsrechter</h2>
      <p className="wb-sub">€13 per wedstrijd + €0,4327 per km, over de gekozen periode.</p>
      {officials.length === 0 ? (
        <p className="wb-sub">Nog geen scheidsrechters geregistreerd.</p>
      ) : (
        <>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.8rem', color: 'var(--dim)', marginTop: 8 }}>
            Scheidsrechter
            <select className="wb-select" value={officialId} onChange={(e) => setOfficialId(e.target.value)}>
              {officials.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.8rem', color: 'var(--dim)', flex: 1 }}>
              Van
              <input className="wb-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.8rem', color: 'var(--dim)', flex: 1 }}>
              Tot
              <input className="wb-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
          <a className="wb-btn wb-btn-primary" href={href()} target="_blank" rel="noreferrer" style={{ marginTop: 14, display: 'inline-block' }}>
            ⬇ Kwitantie genereren (PDF)
          </a>
        </>
      )}
    </section>
  )
}
