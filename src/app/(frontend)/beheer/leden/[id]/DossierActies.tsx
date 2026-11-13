'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { toast } from '@/components/Toaster'

/**
 * Wat de federatie in een lidsdossier doet: een ingediende registratie goed- of afkeuren, en de
 * vergunning, het medisch attest en het doktersverbod aanpassen. Dezelfde routes als de wachtrij en de
 * vroegere ledenlijst (/api/federatie/registraties, /api/admin/leden).
 */
export function DossierActies({
  id,
  ingediend,
  vergunningsstatus,
  medischAttest,
  hogerSpelenVerbod,
}: {
  id: number
  ingediend: boolean
  vergunningsstatus: string
  medischAttest: boolean
  hogerSpelenVerbod: boolean
}) {
  const router = useRouter()
  const [bezig, setBezig] = useState(false)
  const [reden, setReden] = useState('')
  const post = async (url: string, body: unknown, ok: string) => {
    setBezig(true)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) })
      const d = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) return toast('error', d.error ?? 'Mislukt.')
      toast('success', ok)
      router.refresh()
    } finally {
      setBezig(false)
    }
  }
  const lid = (patch: Record<string, unknown>, ok: string) => post('/api/admin/leden', { playerId: id, ...patch }, ok)
  return (
    <section className="ft-kaart" style={{ marginTop: 12 }}>
      <h2>Acties</h2>
      {ingediend && (
        <div className="ft-balk" style={{ position: 'static' }}>
          <button type="button" className="ft-btn ft-primair" disabled={bezig} onClick={() => void post('/api/federatie/registraties', { playerIds: [id], besluit: 'goedkeuren' }, 'Goedgekeurd.')}>
            ✅ Registratie goedkeuren
          </button>
          <input className="ft-zoek" value={reden} onChange={(e) => setReden(e.target.value)} placeholder="Reden bij afkeuren" />
          <button
            type="button"
            className="ft-btn"
            disabled={bezig || reden.trim().length < 3}
            onClick={() => void post('/api/federatie/registraties', { playerIds: [id], besluit: 'afkeuren', reden }, 'Afgekeurd en teruggestuurd naar de club.')}
          >
            Afkeuren
          </button>
        </div>
      )}
      <div className="ft-velden">
        <label className="ft-veld">
          Vergunning
          <select defaultValue={vergunningsstatus} disabled={bezig} onChange={(e) => void lid({ vergunningsstatus: e.target.value }, 'Vergunning bijgewerkt.')}>
            <option value="geen">Geen</option>
            <option value="aangevraagd">Aangevraagd</option>
            <option value="geldig">Geldig</option>
          </select>
        </label>
        <label className="ft-veld">
          Medisch attest aanvaard
          <select defaultValue={medischAttest ? 'ja' : 'nee'} disabled={bezig} onChange={(e) => void lid({ medischAttest: e.target.value === 'ja' }, 'Attest bijgewerkt.')}>
            <option value="ja">Ja</option>
            <option value="nee">Nee</option>
          </select>
        </label>
        <label className="ft-veld">
          Doktersverbod hoger spelen
          <select defaultValue={hogerSpelenVerbod ? 'ja' : 'nee'} disabled={bezig} onChange={(e) => void lid({ hogerSpelenVerbod: e.target.value === 'ja' }, 'Bijgewerkt.')}>
            <option value="nee">Nee</option>
            <option value="ja">Ja</option>
          </select>
        </label>
      </div>
    </section>
  )
}
