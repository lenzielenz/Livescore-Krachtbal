'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { toast } from '@/components/Toaster'
import type { BoeteRij } from '@/lib/boetes'
import { formatDateBE } from '@/lib/datetime'
import { formatEuro } from '@/lib/vergoeding'

const STATUS: Record<string, string> = {
  opgelegd: 'Te betalen',
  betaling_gemeld: 'Betaling gemeld — wacht op bevestiging',
  betaald: 'Betaald',
  betwist: 'Betwist — de federatie beslist',
  vernietigd: 'Vernietigd',
}
const KLEUR: Record<string, string> = { opgelegd: '#e0a23d', betaling_gemeld: '#3d8be0', betaald: '#2a9d6a', betwist: '#e0533d', vernietigd: '#7a8699' }

export function ClubBoetes({ boetes }: { boetes: BoeteRij[] }) {
  const router = useRouter()
  const [bezig, setBezig] = useState<number | null>(null)
  const [tekst, setTekst] = useState<Record<number, string>>({})
  const [betwist, setBetwist] = useState<number | null>(null)

  const post = async (id: number, actie: 'betaling' | 'betwisten', ok: string) => {
    setBezig(id)
    try {
      const res = await fetch('/api/club/boetes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, actie, opmerking: tekst[id] }) })
      const d = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) return toast('error', d.error ?? 'Mislukt.')
      toast('success', ok)
      setBetwist(null)
      router.refresh()
    } catch {
      toast('error', 'Geen verbinding.')
    } finally {
      setBezig(null)
    }
  }

  if (boetes.length === 0) return <p className="empty">Geen boetes. 👏</p>
  return (
    <div className="od-lijst" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
      {boetes.map((b) => (
        <article key={b.id} className="od-kaart" style={{ borderColor: KLEUR[b.status] }}>
          <header className="od-kop">
            <strong>{formatEuro(b.bedrag)}</strong>
            <span className="od-status">{STATUS[b.status] ?? b.status}</span>
          </header>
          <p className="od-tekst">{b.omschrijving}</p>
          <p className="od-dim">
            {formatDateBE(new Date(b.datum))}
            {b.artikel ? ` · ${b.artikel}` : ''}
            {b.matchId ? (
              <>
                {' '}
                · <a href={`/match/${b.matchId}`}>wedstrijd</a>
              </>
            ) : null}
          </p>
          {b.federatieOpmerking && <p className="od-dim">Federatie: {b.federatieOpmerking}</p>}
          {b.clubOpmerking && <p className="od-dim">Jullie opmerking: {b.clubOpmerking}</p>}
          {b.status === 'opgelegd' && (
            <>
              {betwist === b.id && (
                <textarea
                  className="ft-zoek"
                  rows={3}
                  placeholder="Waarom klopt deze boete niet?"
                  value={tekst[b.id] ?? ''}
                  onChange={(e) => setTekst({ ...tekst, [b.id]: e.target.value })}
                />
              )}
              <div className="ft-balk" style={{ position: 'static', padding: 0 }}>
                {betwist === b.id ? (
                  <>
                    <button type="button" className="ft-btn ft-primair" disabled={bezig === b.id} onClick={() => void post(b.id, 'betwisten', 'Betwisting verstuurd naar de federatie.')}>
                      Betwisting versturen
                    </button>
                    <button type="button" className="ft-btn" onClick={() => setBetwist(null)}>
                      Annuleren
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="ft-btn ft-primair" disabled={bezig === b.id} onClick={() => void post(b.id, 'betaling', 'Betaling gemeld — de federatie bevestigt.')}>
                      Betaald
                    </button>
                    <button type="button" className="ft-btn" onClick={() => setBetwist(b.id)}>
                      Betwisten
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </article>
      ))}
    </div>
  )
}
