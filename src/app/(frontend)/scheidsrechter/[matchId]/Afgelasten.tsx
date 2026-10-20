'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { toast } from '@/components/Toaster'

const REDENEN = [
  { value: 'terrein', label: 'Terrein onbespeelbaar' },
  { value: 'weer', label: 'Weersomstandigheden' },
  { value: 'ander', label: 'Andere reden' },
]

/**
 * De scheidsrechter gelast de wedstrijd af (lib/afgelasting.ts): reden, korte toelichting en foto's
 * van de omstandigheden. De federatie ziet het meteen en plant een nieuwe datum.
 */
export function Afgelasten({ matchId }: { matchId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reden, setReden] = useState('terrein')
  const [toelichting, setToelichting] = useState('')
  const [fotos, setFotos] = useState<File[]>([])
  const [bezig, setBezig] = useState(false)

  if (!open) {
    return (
      <button type="button" className="wb-btn" onClick={() => setOpen(true)}>
        ⛈️ Wedstrijd afgelasten
      </button>
    )
  }
  const stuur = async () => {
    if (!window.confirm('De wedstrijd afgelasten? De clubs en de federatie krijgen meteen bericht.')) return
    setBezig(true)
    try {
      const fd = new FormData()
      fd.set('reden', reden)
      fd.set('toelichting', toelichting)
      for (const f of fotos) fd.append('fotos', f)
      const res = await fetch(`/api/match/${matchId}/afgelasten`, { method: 'POST', body: fd, credentials: 'include' })
      const d = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) return toast('error', d.error ?? 'Afgelasten mislukt.')
      toast('success', 'Afgelast. De federatie plant een nieuwe datum; de clubs zijn verwittigd.')
      router.refresh()
    } finally {
      setBezig(false)
    }
  }
  return (
    <div className="bl-form" style={{ marginTop: 10 }}>
      <label>
        Reden
        <select className="wb-input" value={reden} onChange={(e) => setReden(e.target.value)}>
          {REDENEN.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Foto&apos;s van de omstandigheden (max. 6)
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={(e) => setFotos([...fotos, ...Array.from(e.target.files ?? [])].slice(0, 6))}
        />
        {fotos.length > 0 && (
          <span>
            {fotos.length} foto{fotos.length === 1 ? '' : "'s"} gekozen ·{' '}
            <button type="button" className="wb-link" onClick={() => setFotos([])}>
              wissen
            </button>
          </span>
        )}
      </label>
      <label className="bl-breed">
        Toelichting
        <textarea
          className="wb-input"
          rows={2}
          value={toelichting}
          onChange={(e) => setToelichting(e.target.value)}
          placeholder="Bv. plassen op het hele terrein, bevroren ondergrond"
        />
      </label>
      <div className="bl-breed" style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="wb-btn wb-btn-primary" disabled={bezig || fotos.length === 0} onClick={stuur}>
          {bezig ? 'Bezig…' : '⛈️ Afgelasten'}
        </button>
        <button type="button" className="wb-btn" disabled={bezig} onClick={() => setOpen(false)}>
          Annuleren
        </button>
      </div>
    </div>
  )
}
