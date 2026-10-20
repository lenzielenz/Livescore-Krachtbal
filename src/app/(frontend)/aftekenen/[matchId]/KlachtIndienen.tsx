'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { formatDateTimeBE } from '@/lib/datetime'

export type KlachtInfo = { id: number; club: string; reden: string; status: string; beslissing: string | null; op: string }

const STATUS: Record<string, string> = { open: '⏳ Bij de federatie', heropend: '↺ Blad heropend', afgewezen: '✗ Afgewezen' }

// Onder een ingediend blad: de klachten erover, en (voor de clubverantwoordelijken van beide ploegen)
// een klacht indienen. De federatie beslist op /beheer/klachten.
export function KlachtIndienen({ matchId, klachten, magIndienen, weigering }: { matchId: string; klachten: KlachtInfo[]; magIndienen: boolean; weigering: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reden, setReden] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  const dienIn = async () => {
    setBezig(true)
    setFout(null)
    try {
      const res = await fetch('/api/klacht', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matchId: Number(matchId), reden }) })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) return setFout(j.error ?? 'Indienen mislukt.')
      setOpen(false)
      setReden('')
      router.refresh()
    } finally {
      setBezig(false)
    }
  }

  if (!klachten.length && !magIndienen) return null
  return (
    <section className="aft-klacht">
      <h3>⚖️ Klacht over dit blad</h3>
      {klachten.map((k) => (
        <div key={k.id} className={`aft-klacht-item ${k.status}`}>
          <div className="aft-klacht-kop">
            <strong>{k.club}</strong>
            <span>{STATUS[k.status] ?? k.status}</span>
          </div>
          <p>{k.reden}</p>
          {k.beslissing && <p className="aft-klacht-beslissing">Federatie: {k.beslissing}</p>}
          <small>{formatDateTimeBE(k.op)}</small>
        </div>
      ))}
      {magIndienen &&
        (open ? (
          <div className="aft-klacht-form">
            <label>
              Wat klopt er niet op het blad?
              <textarea rows={4} value={reden} onChange={(e) => setReden(e.target.value)} placeholder="Bv. speler 7 van de tegenpartij stond niet op de selectie, of de eindstand is 15–12 in plaats van 15–13." />
            </label>
            <p className="aft-dim">De federatie krijgt de klacht meteen, de andere club ook. Gaat de federatie akkoord, dan wordt het blad heropend en opnieuw ondertekend.</p>
            <div className="aft-knoppen">
              <button type="button" className="wb-btn" onClick={() => setOpen(false)} disabled={bezig}>Annuleren</button>
              <button type="button" className="wb-btn wb-btn-primary aft-teken" onClick={dienIn} disabled={bezig || reden.trim().length < 15}>
                {bezig ? 'Bezig…' : 'Klacht indienen bij de federatie'}
              </button>
            </div>
            {fout && <p className="wb-msg">{fout}</p>}
          </div>
        ) : (
          <button type="button" className="wb-btn" onClick={() => setOpen(true)}>Klacht indienen</button>
        ))}
      {!magIndienen && weigering && klachten.length > 0 && <p className="aft-dim">{weigering}</p>}
    </section>
  )
}
