'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

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
export function BladenLijst({ rijen }: { rijen: BladRij[] }) {
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
      {lijst.length === 0 ? (
        <p className="empty">Geen wedstrijdbladen gevonden.</p>
      ) : (
        <ul className="wbl-lijst">
          {lijst.map((r) => (
            <li key={r.matchId} className="wbl-rij">
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
