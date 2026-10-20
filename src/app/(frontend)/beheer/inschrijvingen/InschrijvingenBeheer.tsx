'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { toast } from '@/components/Toaster'
import type { InschrijvingRij } from '@/lib/inschrijving'

const STATUS: Record<string, string> = { niets: '— nog niets', concept: '✎ concept', ingediend: '📨 ingediend', verwerkt: '✅ verwerkt' }

export function InschrijvingenBeheer({ ronde, rijen }: { ronde: { id: number; open: boolean; status: string }; rijen: InschrijvingRij[] }) {
  const router = useRouter()
  const [bezig, setBezig] = useState<number | string | null>(null)
  const post = async (key: number | string, body: Record<string, unknown>, ok: string) => {
    setBezig(key)
    try {
      const res = await fetch('/api/federatie/inschrijvingen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) return toast('error', j.error ?? 'Mislukt.')
      toast('success', ok)
      router.refresh()
    } finally {
      setBezig(null)
    }
  }
  const teVerwerken = rijen.filter((r) => r.status === 'ingediend' && r.id != null)
  return (
    <div className="ft-wrap">
      <div className="ft-balk" style={{ position: 'static' }}>
        {ronde.status === 'open' ? (
          <button type="button" className="ft-btn" disabled={bezig === 'r'} onClick={() => void post('r', { actie: 'sluiten', ronde: ronde.id }, 'Inschrijvingen gesloten.')}>
            Inschrijvingen sluiten
          </button>
        ) : (
          <button type="button" className="ft-btn" disabled={bezig === 'r'} onClick={() => void post('r', { actie: 'heropenen', ronde: ronde.id }, 'Inschrijvingen terug open.')}>
            Heropenen
          </button>
        )}
        {teVerwerken.length > 0 && (
          <button
            type="button"
            className="ft-btn ft-primair"
            disabled={bezig === 'alle'}
            onClick={async () => {
              setBezig('alle')
              for (const r of teVerwerken) {
                await fetch('/api/federatie/inschrijvingen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actie: 'verwerken', id: r.id }) })
              }
              setBezig(null)
              toast('success', `${teVerwerken.length} inschrijving(en) verwerkt.`)
              router.refresh()
            }}
          >
            Alle ingediende verwerken ({teVerwerken.length})
          </button>
        )}
      </div>
      <div className="ft-tabel-wrap">
        <table className="ft-tabel">
          <thead>
            <tr>
              <th>Club</th>
              <th>Status</th>
              <th>Ploegen (reeks · thuis · koppel)</th>
              <th>Terrein niet vrij</th>
              <th>Wensen</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rijen.map((r) => (
              <tr key={r.clubId}>
                <td>
                  <strong>{r.clubNaam}</strong>
                </td>
                <td>{STATUS[r.status] ?? r.status}</td>
                <td>
                  {r.ploegen.map((p) => (
                    <div key={p.naam}>
                      {p.naam} · {p.reeks}
                      {p.thuis ? ` · ${p.thuis}` : ''}
                      {p.koppelMet ? ` · 🔗 ${p.koppelMet}` : ''}
                    </div>
                  ))}
                </td>
                <td>{r.onbeschikbaar || ''}</td>
                <td style={{ maxWidth: 260 }}>{r.wensen}</td>
                <td>
                  {r.status === 'ingediend' && r.id != null && (
                    <button type="button" className="ft-btn ft-primair" disabled={bezig === r.id} onClick={() => void post(r.id!, { actie: 'verwerken', id: r.id }, `${r.clubNaam} verwerkt.`)}>
                      Verwerken
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
