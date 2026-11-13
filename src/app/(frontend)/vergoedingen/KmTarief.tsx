'use client'

import { useState } from 'react'

// Het km-tarief van de scheidsrechtersvergoeding aanpassen (enkel de federatie). Geldt meteen voor de
// kwitanties, de forfait-onkostenbladen en de scheidsrechterskosten van de clubs.
export function KmTarief({ begin }: { begin: number }) {
  const [waarde, setWaarde] = useState(String(begin).replace('.', ','))
  const [bezig, setBezig] = useState(false)
  const [bericht, setBericht] = useState<{ ok: boolean; tekst: string } | null>(null)

  const bewaar = async () => {
    setBezig(true)
    setBericht(null)
    try {
      const res = await fetch('/api/federatie/km-tarief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kmTarief: waarde }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string; tekst?: string }
      setBericht(res.ok ? { ok: true, tekst: `Bewaard: ${j.tekst} per km. Alle nieuwe kwitanties en onkostenbladen rekenen hiermee.` } : { ok: false, tekst: j.error ?? 'Bewaren lukte niet.' })
    } finally {
      setBezig(false)
    }
  }

  return (
    <section className="wb-card" style={{ maxWidth: 520 }}>
      <h2>Kilometervergoeding</h2>
      <p className="wb-sub">Eén tarief voor de kwitantie en het forfait-onkostenblad. Pas het aan als de federatie een nieuw tarief beslist.</p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 8 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.8rem', color: 'var(--dim)' }}>
          € per km
          <input className="wb-input" inputMode="decimal" value={waarde} onChange={(e) => setWaarde(e.target.value)} style={{ width: 120 }} />
        </label>
        <button className="wb-btn wb-btn-primary" onClick={bewaar} disabled={bezig}>
          {bezig ? 'Bewaren…' : 'Bewaren'}
        </button>
      </div>
      {bericht && (
        <p className="wb-sub" role="status" style={{ marginTop: 8, color: bericht.ok ? 'var(--ok, #2e7d32)' : 'var(--danger, #c62828)' }}>
          {bericht.tekst}
        </p>
      )}
    </section>
  )
}
