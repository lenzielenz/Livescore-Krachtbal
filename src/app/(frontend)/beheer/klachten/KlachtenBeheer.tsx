'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { toast } from '@/components/Toaster'
import { formatDateTimeBE } from '@/lib/datetime'

export type KlachtRij = {
  id: number
  matchId: number
  wedstrijd: string
  datum: string
  club: string
  door: string
  reden: string
  status: string
  beslissing: string | null
  op: string
}

const STATUS: Record<string, string> = { open: 'Open', heropend: 'Blad heropend', afgewezen: 'Afgewezen' }

export function KlachtenBeheer({ lijst }: { lijst: KlachtRij[] }) {
  const router = useRouter()
  const [toelichting, setToelichting] = useState<Record<number, string>>({})
  const [bezig, setBezig] = useState<number | null>(null)

  const beslis = async (k: KlachtRij, actie: 'heropenen' | 'afwijzen') => {
    if (actie === 'heropenen' && !window.confirm(`Het blad ${k.wedstrijd} heropenen? De handtekeningen vervallen en het moet opnieuw ondertekend worden.`)) return
    setBezig(k.id)
    try {
      const res = await fetch('/api/federatie/klachten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ klachtId: k.id, actie, toelichting: toelichting[k.id] ?? '' }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) return toast('error', j.error ?? 'Mislukt.')
      toast('success', actie === 'heropenen' ? `Blad heropend — ${k.wedstrijd} moet opnieuw ondertekend worden.` : `Klacht afgewezen — beide clubs zijn verwittigd.`)
      router.refresh()
    } finally {
      setBezig(null)
    }
  }

  return (
    <ul className="kl-lijst">
      {lijst.map((k) => (
        <li key={k.id} className={`kl-kaart ${k.status}`}>
          <div className="kl-kop">
            <div>
              <strong>{k.wedstrijd}</strong>
              <span className="kl-sub">
                {k.datum} · klacht van <strong>{k.club}</strong>
                {k.door ? ` (${k.door})` : ''} · {formatDateTimeBE(k.op)}
              </span>
            </div>
            <span className={`kl-status ${k.status}`}>{STATUS[k.status] ?? k.status}</span>
          </div>
          <blockquote className="kl-reden">{k.reden}</blockquote>
          <div className="kl-links">
            <Link href={`/aftekenen/${k.matchId}`}>Blad bekijken →</Link>
            <a href={`/api/matchsheet/${k.matchId}/pdf`} target="_blank" rel="noreferrer">PDF →</a>
          </div>
          {k.status === 'open' ? (
            <div className="kl-beslis">
              <textarea
                rows={2}
                placeholder="Toelichting voor beide clubs (verplicht bij afwijzen)"
                value={toelichting[k.id] ?? ''}
                onChange={(e) => setToelichting((t) => ({ ...t, [k.id]: e.target.value }))}
              />
              <div className="kl-knoppen">
                <button type="button" className="wb-btn" disabled={bezig === k.id} onClick={() => beslis(k, 'afwijzen')}>Afwijzen</button>
                <button type="button" className="wb-btn wb-btn-primary" disabled={bezig === k.id} onClick={() => beslis(k, 'heropenen')}>↺ Blad heropenen</button>
              </div>
            </div>
          ) : (
            k.beslissing && <p className="kl-sub">Beslissing: {k.beslissing}</p>
          )}
        </li>
      ))}
    </ul>
  )
}
