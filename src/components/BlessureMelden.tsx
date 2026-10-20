'use client'

import { useCallback, useEffect, useState } from 'react'

import { toast } from '@/components/Toaster'
import { formatDateTimeBE } from '@/lib/datetime'

export type BlessureKant = {
  side: 'home' | 'away'
  teamNaam: string
  spelers: { id: number; naam: string; rugnummer: number | null }[]
}

type Rij = { id: number; naam: string; kant: 'home' | 'away' | null; moment: string; omschrijving: string; tijdstip: string }

/**
 * Een blessure doorgeven bij een wedstrijd (lib/blessure.ts): speler kiezen, kort omschrijven,
 * klaar. Het moment (helft, klok, stand) vult de server zelf in. Daarna staat ze op het
 * wedstrijdblad, is de ongevalsaangifte klaar en krijgen club, speler (of ouder) en federatie een melding.
 */
export function BlessureMelden({ matchId, kanten }: { matchId: string | number; kanten: BlessureKant[] }) {
  const [side, setSide] = useState<'home' | 'away'>(kanten[0]?.side ?? 'home')
  const [speler, setSpeler] = useState('')
  const [naam, setNaam] = useState('')
  const [omschrijving, setOmschrijving] = useState('')
  const [bezig, setBezig] = useState(false)
  const [lijst, setLijst] = useState<Rij[] | null>(null)

  const laad = useCallback(async () => {
    const res = await fetch(`/api/matchsheet/${matchId}/blessure`, { credentials: 'include' })
    if (res.ok) setLijst(((await res.json()) as { blessures: Rij[] }).blessures)
  }, [matchId])
  useEffect(() => {
    void laad()
  }, [laad])

  const kant = kanten.find((k) => k.side === side)
  const ander = speler === 'ander'

  const stuur = async () => {
    setBezig(true)
    try {
      const res = await fetch(`/api/matchsheet/${matchId}/blessure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ side, playerId: ander || !speler ? null : Number(speler), naam: ander ? naam : null, omschrijving }),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) return toast('error', d.error ?? 'Doorgeven mislukt.')
      toast('success', 'Blessure doorgegeven: op het blad, aangifte klaar, club en federatie verwittigd.')
      setSpeler('')
      setNaam('')
      setOmschrijving('')
      void laad()
    } finally {
      setBezig(false)
    }
  }

  return (
    <section className="wb-card" id="blessure" style={{ marginBottom: 16 }}>
      <h2>🚑 Blessure doorgeven</h2>
      <p className="wb-sub">
        Kies de speler en omschrijf kort wat er gebeurde. Het moment (helft, klok, stand) komt er vanzelf bij. Het staat
        daarna op het wedstrijdblad, de ongevalsaangifte is klaar en de club, de speler (of zijn ouder) en de federatie
        krijgen een melding.
      </p>
      <div className="bl-form">
        <label>
          Ploeg
          <select
            className="wb-input"
            value={side}
            onChange={(e) => {
              setSide(e.target.value === 'away' ? 'away' : 'home')
              setSpeler('')
            }}
          >
            {kanten.map((k) => (
              <option key={k.side} value={k.side}>
                {k.side === 'home' ? 'Thuis' : 'Uit'} — {k.teamNaam}
              </option>
            ))}
          </select>
        </label>
        <label>
          Speler
          <select className="wb-input" value={speler} onChange={(e) => setSpeler(e.target.value)}>
            <option value="">Kies…</option>
            {kant?.spelers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.rugnummer != null ? `#${p.rugnummer} ` : ''}
                {p.naam}
              </option>
            ))}
            <option value="ander">Iemand anders (geen speler op het blad)</option>
          </select>
        </label>
        {ander && (
          <label>
            Naam
            <input className="wb-input" value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Voornaam en naam" />
          </label>
        )}
        <label className="bl-breed">
          Wat gebeurde er?
          <textarea
            className="wb-input"
            rows={2}
            value={omschrijving}
            onChange={(e) => setOmschrijving(e.target.value)}
            placeholder="Bv. verzwikte enkel bij de landing, kon niet verder spelen"
          />
        </label>
      </div>
      <button
        type="button"
        className="wb-btn wb-btn-primary"
        disabled={bezig || !omschrijving.trim() || !speler || (ander && !naam.trim())}
        onClick={stuur}
      >
        {bezig ? 'Bezig…' : 'Blessure doorgeven'}
      </button>

      {lijst && lijst.length > 0 && (
        <ul className="wb-rows" style={{ marginTop: 12 }}>
          {lijst.map((b) => (
            <li key={b.id} className="wb-row" style={{ cursor: 'default', flexWrap: 'wrap' }}>
              <span className="nm">
                <strong>{b.naam}</strong>
                {b.kant ? ` (${b.kant === 'home' ? 'thuis' : 'uit'})` : ''} · {b.moment || formatDateTimeBE(new Date(b.tijdstip))}
                <span className="wb-reason">{b.omschrijving}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
