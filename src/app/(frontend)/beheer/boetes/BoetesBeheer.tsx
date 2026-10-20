'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { toast } from '@/components/Toaster'
import type { BoeteRij } from '@/lib/boetes'
import { formatDateBE } from '@/lib/datetime'
import { formatEuro } from '@/lib/vergoeding'

export const BOETE_STATUS_TEKST: Record<string, string> = {
  voorstel: 'Voorstel',
  opgelegd: 'Opgelegd — te betalen',
  betaling_gemeld: 'Betaling gemeld',
  betaald: 'Betaald',
  betwist: 'Betwist',
  vernietigd: 'Vernietigd',
}
const KLEUR: Record<string, string> = { voorstel: '#7a8699', opgelegd: '#e0a23d', betaling_gemeld: '#3d8be0', betaald: '#2a9d6a', betwist: '#e0533d', vernietigd: '#7a8699' }

export function BoetesBeheer({ lijst, soorten, clubs }: { lijst: BoeteRij[]; soorten: { id: number; naam: string; bedrag: number }[]; clubs: { id: number; naam: string }[] }) {
  const router = useRouter()
  const [bezig, setBezig] = useState<number | 'nieuw' | null>(null)
  const [opm, setOpm] = useState<Record<number, string>>({})
  const [bedrag, setBedrag] = useState<Record<number, string>>({})
  const [nieuw, setNieuw] = useState({ club: '', soort: '', omschrijving: '', bedrag: '' })

  const post = async (key: number | 'nieuw', body: Record<string, unknown>, ok: string) => {
    setBezig(key)
    try {
      const res = await fetch('/api/federatie/boetes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) return toast('error', d.error ?? 'Mislukt.')
      toast('success', ok)
      router.refresh()
    } catch {
      toast('error', 'Geen verbinding.')
    } finally {
      setBezig(null)
    }
  }

  const groepen = ['voorstel', 'betwist', 'betaling_gemeld', 'opgelegd', 'betaald', 'vernietigd'].map((s) => ({ s, rijen: lijst.filter((b) => b.status === s) })).filter((g) => g.rijen.length)

  return (
    <div className="ft-wrap">
      <section className="ft-kaart">
        <strong>Boete manueel opleggen</strong>
        <div className="ft-velden">
          <label className="ft-veld">
            Club
            <select value={nieuw.club} onChange={(e) => setNieuw({ ...nieuw, club: e.target.value })}>
              <option value="">— kies —</option>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.naam}
                </option>
              ))}
            </select>
          </label>
          <label className="ft-veld">
            Uit de boetelijst
            <select
              value={nieuw.soort}
              onChange={(e) => {
                const s = soorten.find((x) => String(x.id) === e.target.value)
                setNieuw({ ...nieuw, soort: e.target.value, bedrag: s ? String(s.bedrag) : nieuw.bedrag })
              }}
            >
              <option value="">— vrij —</option>
              {soorten.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.naam} ({formatEuro(s.bedrag)})
                </option>
              ))}
            </select>
          </label>
          <label className="ft-veld">
            Omschrijving
            <input value={nieuw.omschrijving} placeholder="bv. wedstrijd X: geen terreinverantwoordelijke" onChange={(e) => setNieuw({ ...nieuw, omschrijving: e.target.value })} />
          </label>
          <label className="ft-veld">
            Bedrag (€)
            <input inputMode="decimal" value={nieuw.bedrag} onChange={(e) => setNieuw({ ...nieuw, bedrag: e.target.value.replace(',', '.') })} />
          </label>
        </div>
        <div>
          <button
            type="button"
            className="ft-btn ft-primair"
            disabled={bezig === 'nieuw' || !nieuw.club}
            onClick={() => void post('nieuw', { actie: 'manueel', ...nieuw }, 'Boete opgelegd — de club is verwittigd.')}
          >
            Opleggen
          </button>
        </div>
      </section>

      {groepen.length === 0 && <p className="empty">Geen openstaande boetes of voorstellen. ✅</p>}
      {groepen.map((g) => (
        <section key={g.s} className="ft-dag">
          <h2 style={{ margin: '8px 0 0', fontSize: '1rem' }}>
            {BOETE_STATUS_TEKST[g.s]} ({g.rijen.length})
          </h2>
          <div className="od-lijst" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
            {g.rijen.map((b) => (
              <article key={b.id} className="od-kaart" style={{ borderColor: KLEUR[b.status] }}>
                <header className="od-kop">
                  <strong>{b.clubNaam}</strong>
                  <span className="od-status">{formatEuro(b.bedrag)}</span>
                </header>
                <p className="od-tekst">{b.omschrijving}</p>
                <p className="od-dim">
                  {b.bron === 'automatisch' ? 'Automatisch voorstel' : 'Manueel'} · {formatDateBE(new Date(b.datum))}
                  {b.matchId ? (
                    <>
                      {' '}
                      · <a href={`/match/${b.matchId}`}>wedstrijd</a>
                    </>
                  ) : null}
                </p>
                {b.clubOpmerking && <p className="od-tekst">🗨️ Club: {b.clubOpmerking}</p>}
                {b.federatieOpmerking && <p className="od-dim">Federatie: {b.federatieOpmerking}</p>}
                {['voorstel', 'opgelegd', 'betaling_gemeld', 'betwist'].includes(b.status) && (
                  <>
                    <input
                      className="ft-zoek"
                      placeholder="Opmerking voor de club (optioneel)"
                      value={opm[b.id] ?? ''}
                      onChange={(e) => setOpm({ ...opm, [b.id]: e.target.value })}
                    />
                    <div className="ft-balk" style={{ position: 'static', padding: 0 }}>
                      {b.status === 'voorstel' && (
                        <>
                          <input
                            style={{ width: 90 }}
                            inputMode="decimal"
                            aria-label="Bedrag"
                            placeholder={String(b.bedrag)}
                            value={bedrag[b.id] ?? ''}
                            onChange={(e) => setBedrag({ ...bedrag, [b.id]: e.target.value.replace(',', '.') })}
                          />
                          <button type="button" className="ft-btn ft-primair" disabled={bezig === b.id} onClick={() => void post(b.id, { actie: 'opleggen', id: b.id, bedrag: bedrag[b.id], opmerking: opm[b.id] }, 'Opgelegd — de club is verwittigd.')}>
                            Opleggen
                          </button>
                        </>
                      )}
                      {(b.status === 'opgelegd' || b.status === 'betaling_gemeld') && (
                        <button type="button" className="ft-btn ft-primair" disabled={bezig === b.id} onClick={() => void post(b.id, { actie: 'betaald', id: b.id }, 'Als betaald gemarkeerd.')}>
                          Betaald ✓
                        </button>
                      )}
                      {b.status === 'betwist' && (
                        <button type="button" className="ft-btn" disabled={bezig === b.id} onClick={() => void post(b.id, { actie: 'handhaven', id: b.id, opmerking: opm[b.id] }, 'Gehandhaafd — de club is verwittigd.')}>
                          Handhaven
                        </button>
                      )}
                      <button type="button" className="ft-btn" disabled={bezig === b.id} onClick={() => void post(b.id, { actie: 'vernietigen', id: b.id, opmerking: opm[b.id] }, b.status === 'voorstel' ? 'Voorstel geschrapt.' : 'Vernietigd — de club is verwittigd.')}>
                        {b.status === 'voorstel' ? 'Schrappen' : 'Vernietigen'}
                      </button>
                    </div>
                  </>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
