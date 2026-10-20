'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { toast } from '@/components/Toaster'
import { dateStrBE } from '@/lib/datetime'

/** De medische keuring invoeren: datum + ingevuld attest. Voor jezelf (playerId leeg) of als ouder voor je kind. */
export function KeuringInvoeren({ playerId, heeftAttest }: { playerId?: number; heeftAttest: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [datum, setDatum] = useState('')
  const [bestand, setBestand] = useState<File | null>(null)
  const [bezig, setBezig] = useState(false)

  if (!open) {
    return (
      <button type="button" className="wb-btn" onClick={() => setOpen(true)}>
        📋 Keuring invoeren
      </button>
    )
  }
  return (
    <div className="pf-keuring">
      <label>
        Datum van de keuring
        <input type="date" value={datum} max={dateStrBE()} onChange={(e) => setDatum(e.target.value)} />
      </label>
      <label>
        Ingevulde medische kaart / attest (PDF of foto){heeftAttest ? ' — vervangt het vorige' : ''}
        <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setBestand(e.target.files?.[0] ?? null)} />
      </label>
      <div className="pf-keuring-acties">
        <button
          type="button"
          className="wb-btn wb-btn-primary"
          disabled={bezig || !datum || (!bestand && !heeftAttest)}
          onClick={async () => {
            setBezig(true)
            try {
              const fd = new FormData()
              if (playerId != null) fd.set('playerId', String(playerId))
              fd.set('datum', datum)
              if (bestand) fd.set('bestand', bestand)
              const res = await fetch('/api/medische-kaart/keuring', { method: 'POST', body: fd, credentials: 'include' })
              const d = (await res.json().catch(() => ({}))) as { error?: string }
              if (!res.ok) return toast('error', d.error ?? 'Bewaren mislukt.')
              toast('success', 'Keuring bewaard; de club krijgt een melding.')
              setOpen(false)
              router.refresh()
            } finally {
              setBezig(false)
            }
          }}
        >
          {bezig ? 'Bezig…' : 'Bewaren'}
        </button>
        <button type="button" className="wb-btn" disabled={bezig} onClick={() => setOpen(false)}>
          Annuleren
        </button>
      </div>
    </div>
  )
}
