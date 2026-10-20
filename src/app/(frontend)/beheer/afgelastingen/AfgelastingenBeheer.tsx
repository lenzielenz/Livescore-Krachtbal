'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { toast } from '@/components/Toaster'
import { brusselsWallUtc, formatDateTimeBE } from '@/lib/datetime'
import type { AfgelastingRij } from '@/lib/afgelasting'

/** Een datetime-local-waarde (Brusselse wandklok) → ISO in UTC. */
const naarUtc = (lokaal: string): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(lokaal)
  return m ? brusselsWallUtc(+m[1], +m[2], +m[3], +m[4], +m[5]).toISOString() : null
}
const STATUS: Record<string, string> = { gemeld: 'Nieuwe datum te plannen', herpland: 'Herpland', ingetrokken: 'Ingetrokken' }

export function AfgelastingenBeheer({ lijst }: { lijst: AfgelastingRij[] }) {
  const router = useRouter()
  const [datum, setDatum] = useState<Record<number, string>>({})
  const [bezig, setBezig] = useState<number | null>(null)

  const doe = async (id: number, body: Record<string, unknown>, ok: string) => {
    setBezig(id)
    try {
      const res = await fetch('/api/federatie/afgelastingen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, ...body }),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) return toast('error', d.error ?? 'Mislukt.')
      toast('success', ok)
      router.refresh()
    } finally {
      setBezig(null)
    }
  }

  return (
    <div className="od-lijst" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))' }}>
      {lijst.map((a) => (
        <article key={a.id} className="od-kaart" style={{ borderColor: a.status === 'gemeld' ? '#e0a23d' : '#2a9d6a' }}>
          <header className="od-kop">
            <strong>{a.titel}</strong>
            {a.reeks ? <span className="od-dim"> · {a.reeks}</span> : null}
            <span className="od-status">{STATUS[a.status] ?? a.status}</span>
          </header>
          <p className="od-dim">
            Gepland {a.oorspronkelijk ? formatDateTimeBE(new Date(a.oorspronkelijk)) : '—'} · afgelast door {a.scheidsrechter || 'de scheidsrechter'} ·{' '}
            {formatDateTimeBE(new Date(a.gemeldOp))}
          </p>
          <p className="od-tekst">
            <strong>{a.reden}</strong>
            {a.toelichting ? ` — ${a.toelichting}` : ''}
          </p>
          {a.fotos.length > 0 ? (
            <div className="af-fotos">
              {a.fotos.map((f) => (
                <a key={f} href={f} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f} alt="Omstandigheden" />
                </a>
              ))}
            </div>
          ) : (
            <p className="od-dim">Geen foto&apos;s.</p>
          )}
          {a.status === 'herpland' && a.nieuweDatum && <p className="od-dim">Nieuwe datum: {formatDateTimeBE(new Date(a.nieuweDatum))}</p>}
          {a.status === 'gemeld' && (
            <div className="od-fed">
              <input
                type="datetime-local"
                className="wb-input"
                value={datum[a.id] ?? ''}
                onChange={(e) => setDatum((d) => ({ ...d, [a.id]: e.target.value }))}
                aria-label="Nieuwe datum en uur"
              />
              <button
                type="button"
                className="wb-btn wb-btn-primary"
                disabled={bezig === a.id || !datum[a.id]}
                onClick={() => {
                  const iso = naarUtc(datum[a.id] ?? '')
                  if (iso) void doe(a.id, { actie: 'herplannen', datum: iso }, 'Herpland; clubs en scheidsrechter verwittigd.')
                }}
              >
                🔁 Herplannen
              </button>
              <button
                type="button"
                className="wb-btn"
                disabled={bezig === a.id}
                onClick={() => {
                  if (window.confirm('De afgelasting intrekken? De wedstrijd gaat dan door zoals gepland.')) {
                    void doe(a.id, { actie: 'intrekken' }, 'Ingetrokken; de wedstrijd gaat door.')
                  }
                }}
              >
                Intrekken
              </button>
            </div>
          )}
        </article>
      ))}
    </div>
  )
}
