'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { toast } from '@/components/Toaster'
import { formatDateBE } from '@/lib/datetime'

export type KaartAanvraag = { id: number; naam: string; clubNaam: string; via: 'lid' | 'club'; op: string; playerId: number | null }

// Aanvragen voor een medische kaart: door het lid zelf of door de club. Afdrukken (PDF met QR, een blad
// per lid), dan verstuurd of geweigerd (met reden); lid en club krijgen telkens een melding. Na
// "verstuurd" kan het lid de kaart ook zelf afdrukken.
const pdfVan = (ids: (number | null)[]) => `/api/medische-kaart/pdf?ids=${ids.filter((x) => x != null).join(',')}`
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
        {aanvragen.some((a) => a.playerId != null) && (
          <a className="cl-btn" href={pdfVan(aanvragen.slice(0, 300).map((a) => a.playerId))} target="_blank" rel="noopener">
            🖨️ {aanvragen.length > 1 ? `Alle ${Math.min(aanvragen.length, 300)} afdrukken` : 'Afdrukken'}
          </a>
        )}
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
            {a.playerId != null && (
              <a className="cl-btn" href={pdfVan([a.playerId])} target="_blank" rel="noopener">
                🖨️ Kaart
              </a>
            )}
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
