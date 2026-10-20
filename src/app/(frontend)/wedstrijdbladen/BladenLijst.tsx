'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { toast } from '@/components/Toaster'

export type BladRij = {
  matchId: number
  datum: string
  sorteer: string
  reeks: string
  thuis: string
  uit: string
  score: { home: number; away: number } | null
  status: string
  /** Status van een klacht over dit blad: open, heropend of afgewezen. */
  klacht: string | null
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// Zoeken op ploeg, filteren op reeks en status — één scherm voor honderden bladen.
export function BladenLijst({ rijen, federatie = false }: { rijen: BladRij[]; federatie?: boolean }) {
  const router = useRouter()
  // Federatie: bladen die nog af te tekenen zijn aanvinken en iedereen in één keer herinneren.
  const [gekozen, setGekozen] = useState<Set<number>>(new Set())
  const [bezig, setBezig] = useState(false)
  const herinner = async (ids: number[]) => {
    if (!ids.length || !window.confirm(`Een herinnering sturen voor ${ids.length} ${ids.length === 1 ? 'blad' : 'bladen'}? De clubs en de scheidsrechter krijgen een melding.`)) return
    setBezig(true)
    try {
      const res = await fetch('/api/federatie/blad-herinnering', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matchIds: ids }) })
      const j = (await res.json().catch(() => ({}))) as { verstuurd?: number; error?: string }
      if (!res.ok) return toast('error', j.error ?? 'Mislukt.')
      toast('success', `Herinnering verstuurd voor ${j.verstuurd} ${j.verstuurd === 1 ? 'blad' : 'bladen'}.`)
      setGekozen(new Set())
      router.refresh()
    } finally {
      setBezig(false)
    }
  }
  const [zoek, setZoek] = useState('')
  const [reeks, setReeks] = useState('')
  const [status, setStatus] = useState<'alle' | 'ingediend' | 'af_te_tekenen' | 'klacht'>('alle')
  const reeksen = useMemo(() => [...new Set(rijen.map((r) => r.reeks).filter(Boolean))].sort(), [rijen])
  const tel = { ingediend: rijen.filter((r) => r.status === 'ingediend').length, af: rijen.filter((r) => r.status === 'af_te_tekenen').length, klacht: rijen.filter((r) => r.klacht === 'open').length }
  const lijst = rijen.filter((r) => {
    if (reeks && r.reeks !== reeks) return false
    if (status === 'klacht' ? r.klacht !== 'open' : status !== 'alle' && r.status !== status) return false
    const q = norm(zoek.trim())
    return !q || norm(`${r.thuis} ${r.uit}`).includes(q)
  })
  return (
    <div className="wbl">
      <div className="wbl-filters">
        <input className="acc-search" type="search" placeholder="Zoek een ploeg…" value={zoek} onChange={(e) => setZoek(e.target.value)} aria-label="Zoek een ploeg" />
        <select value={reeks} onChange={(e) => setReeks(e.target.value)} aria-label="Reeks">
          <option value="">Alle reeksen</option>
          {reeksen.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <div className="wbl-tabs" role="tablist" aria-label="Status">
          {(
            [
              ['alle', `Alle (${rijen.length})`],
              ['ingediend', `Ingediend (${tel.ingediend})`],
              ['af_te_tekenen', `Af te tekenen (${tel.af})`],
              ['klacht', `Klacht (${tel.klacht})`],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={status === k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {federatie && tel.af > 0 && (
        <div className="wbl-bulk">
          {gekozen.size > 0 ? (
            <button type="button" className="wb-btn wb-btn-primary" disabled={bezig} onClick={() => void herinner([...gekozen])}>🔔 Herinner ({gekozen.size})</button>
          ) : (
            <button type="button" className="wb-btn wb-btn-primary" disabled={bezig} onClick={() => void herinner(rijen.filter((r) => r.status === 'af_te_tekenen').map((r) => r.matchId))}>
              🔔 Herinner alle {tel.af} nog af te tekenen bladen
            </button>
          )}
          <span className="wbl-meta">Clubs en scheidsrechter krijgen een melding met de link naar het blad.</span>
        </div>
      )}
      {lijst.length === 0 ? (
        <p className="empty">Geen wedstrijdbladen gevonden.</p>
      ) : (
        <ul className="wbl-lijst">
          {lijst.map((r) => (
            <li key={r.matchId} className="wbl-rij">
              {federatie && r.status === 'af_te_tekenen' && (
                <input
                  type="checkbox"
                  className="wbl-vink"
                  aria-label={`Kies ${r.thuis} – ${r.uit}`}
                  checked={gekozen.has(r.matchId)}
                  onChange={() =>
                    setGekozen((s) => {
                      const n = new Set(s)
                      if (n.has(r.matchId)) n.delete(r.matchId)
                      else n.add(r.matchId)
                      return n
                    })
                  }
                />
              )}
              <div className="wbl-info">
                <span className="wbl-meta">
                  {r.datum}
                  {r.reeks ? ` · ${r.reeks}` : ''}
                </span>
                <span className="wbl-teams">
                  {r.thuis} <strong>{r.score ? `${r.score.home} – ${r.score.away}` : '–'}</strong> {r.uit}
                </span>
                <span className="wbl-badges">
                  <span className={`wbl-badge ${r.status === 'ingediend' ? 'ok' : 'wacht'}`}>{r.status === 'ingediend' ? '✓ Ingediend' : '✍️ Af te tekenen'}</span>
                  {r.klacht === 'open' && <span className="wbl-badge klacht">⚖️ Klacht</span>}
                  {r.klacht === 'heropend' && <span className="wbl-badge wacht">↺ Heropend na klacht</span>}
                </span>
              </div>
              <div className="wbl-acties">
                <Link href={`/aftekenen/${r.matchId}`} className="wb-btn">Bekijk</Link>
                <a href={`/api/matchsheet/${r.matchId}/pdf`} target="_blank" rel="noreferrer" className="wb-btn wb-btn-primary">PDF</a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
