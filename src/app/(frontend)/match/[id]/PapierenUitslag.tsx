'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import './report-result.css'

/**
 * Federatie: de eindstand van het noodblad (papier) ingeven, ook als de wedstrijd half
 * aangetekend werd en daarna op papier verder ging (zie papierenUitslag in simple-match-engine.ts).
 */
export function PapierenUitslag({
  matchId,
  homeName,
  awayName,
  huidig,
}: {
  matchId: number
  homeName: string
  awayName: string
  huidig: { home: number; away: number }
}) {
  const router = useRouter()
  const [home, setHome] = useState('')
  const [away, setAway] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [vraagVervang, setVraagVervang] = useState(false)

  const verstuur = async (vervang: boolean) => {
    const h = Number(home)
    const a = Number(away)
    if (home === '' || away === '' || !Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0) {
      setErr('Geef een geldige eindstand op.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch(`/api/match/${matchId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'papierenuitslag', home: h, away: a, vervang, opId: crypto.randomUUID() }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        if (!vervang && /hoger dan het papier/.test(j.error ?? '')) setVraagVervang(true)
        throw new Error(j.error || 'Ingeven mislukt — probeer opnieuw.')
      }
      router.refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Geen verbinding — probeer opnieuw.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rr" aria-label="Uitslag van het noodblad">
      <h2 className="rr-h">📝 Uitslag van papier (noodblad)</h2>
      <p className="rr-note">
        Viel het aantekentoestel uit en ging de wedstrijd op papier verder? Geef hier de eindstand van het noodblad in. Op het
        toestel stond {huidig.home}–{huidig.away}; wat daar genoteerd was blijft staan.{' '}
        <a href={`/api/matchsheet/${matchId}/pdf?nood=1`} target="_blank" rel="noreferrer">
          Noodblad afdrukken
        </a>
      </p>
      <form
        className="rr-form"
        style={{ marginTop: 10 }}
        onSubmit={(e) => {
          e.preventDefault()
          void verstuur(false)
        }}
      >
        <span className="rr-team">{homeName}</span>
        <input className="rr-score" inputMode="numeric" aria-label={`Eindstand ${homeName}`} value={home} onChange={(e) => setHome(e.target.value.replace(/\D/g, '').slice(0, 3))} />
        <span className="rr-dash">–</span>
        <input className="rr-score" inputMode="numeric" aria-label={`Eindstand ${awayName}`} value={away} onChange={(e) => setAway(e.target.value.replace(/\D/g, '').slice(0, 3))} />
        <span className="rr-team away">{awayName}</span>
        <button type="submit" className="rr-send" disabled={busy}>
          {busy ? 'Bezig…' : 'Eindstand ingeven'}
        </button>
      </form>
      {err && <p className="rr-err">{err}</p>}
      {vraagVervang && (
        <button type="button" className="rr-send" style={{ marginTop: 8 }} disabled={busy} onClick={() => void verstuur(true)}>
          Papier klopt — vervang de digitale stand
        </button>
      )}
      <p className="rr-hint">De wedstrijd gaat daarna naar aftekenen; het blad volgt de gewone weg naar indienen.</p>
    </section>
  )
}
