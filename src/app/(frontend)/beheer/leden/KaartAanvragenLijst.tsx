'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { toast } from '@/components/Toaster'
import { formatDateBE } from '@/lib/datetime'

export type KaartAanvraag = { id: number; naam: string; clubNaam: string; via: 'lid' | 'club'; op: string }

// Aanvragen voor een medische kaart: door het lid zelf of door de club. Verstuurd of geweigerd (met
// reden); lid en club krijgen telkens een melding.
export function KaartAanvragenLijst({ aanvragen }: { aanvragen: KaartAanvraag[] }) {
  const router = useRouter()
  const [weiger, setWeiger] = useState<number | null>(null)
  const [reden, setReden] = useState('')
  const [bezig, setBezig] = useState(false)

  const behandel = async (ids: number[], status: 'verstuurd' | 'geweigerd', opmerking?: string) => {
    setBezig(true)
    try {
      const res = await fetch('/api/federatie/medische-kaart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids, status, opmerking }),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string; behandeld?: number }
      if (!res.ok) return toast('error', d.error ?? 'Mislukt.')
      toast('success', `${d.behandeld ?? 0} behandeld; lid en club kregen een melding.`)
      setWeiger(null)
      setReden('')
      router.refresh()
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className="fw-wrap" id="kaarten">
      <div className="fw-kop">
        <h2>🩺 Aanvragen medische kaart ({aanvragen.length})</h2>
        {aanvragen.length > 1 && (
          <button type="button" className="cl-btn cl-btn-primary" disabled={bezig} onClick={() => behandel(aanvragen.map((a) => a.id), 'verstuurd')}>
            Alles verstuurd
          </button>
        )}
      </div>
      {aanvragen.length === 0 && <span className="cl-sub">Geen openstaande aanvragen.</span>}
      {aanvragen.map((a) => (
        <div key={a.id} className="fw-rij">
          <span aria-hidden>🩺</span>
          <div className="fw-gegevens">
            <span className="cl-naam">
              {a.naam} <span className="acc-count">· {a.clubNaam}</span>
            </span>
            <span className="cl-sub">
              {a.via === 'lid' ? 'Door het lid zelf' : 'Door de club'} · {formatDateBE(a.op)}
            </span>
          </div>
          <div className="fw-acties">
            <button type="button" className="cl-btn cl-btn-primary" disabled={bezig} onClick={() => behandel([a.id], 'verstuurd')}>
              ✅ Verstuurd
            </button>
            <button type="button" className="cl-btn cl-btn-danger" disabled={bezig} onClick={() => setWeiger(weiger === a.id ? null : a.id)}>
              Weigeren
            </button>
          </div>
          {weiger === a.id && (
            <div className="fw-afkeur">
              <input className="cl-reden" value={reden} onChange={(e) => setReden(e.target.value)} placeholder="Reden (lid en club zien dit)" autoFocus />
              <button type="button" className="cl-btn cl-btn-danger" disabled={bezig || !reden.trim()} onClick={() => behandel([a.id], 'geweigerd', reden)}>
                Weigeren bevestigen
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
