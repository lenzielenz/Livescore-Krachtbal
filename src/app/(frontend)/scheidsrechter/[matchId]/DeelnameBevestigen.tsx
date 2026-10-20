'use client'

import { useState } from 'react'

import { toast } from '@/components/Toaster'

export type DeelnameSpeler = { id: number; naam: string; rugnummer: number | null; deelgenomen: boolean }
export type DeelnameKant = { side: 'home' | 'away'; teamNaam: string; spelers: DeelnameSpeler[] }

// Na de wedstrijd: de scheidsrechter bevestigt wie effectief speelde (O-markering op het blad).
// Die bevestiging komt bij elke speler terecht ("Selecties / gespeeld" op de spelerspagina) en telt
// mee voor bv. het minimum aantal wedstrijden voor het referendum. Voorgevuld met de selectie van de
// coach; wie al bevestigd werd, blijft aangevinkt.
export function DeelnameBevestigen({ matchId, kanten, vergrendeld }: { matchId: string; kanten: DeelnameKant[]; vergrendeld: boolean }) {
  const alBevestigd = kanten.some((k) => k.spelers.some((s) => s.deelgenomen))
  const [gekozen, setGekozen] = useState<Record<'home' | 'away', Set<number>>>(() => ({
    home: new Set((kanten.find((k) => k.side === 'home')?.spelers ?? []).filter((s) => !alBevestigd || s.deelgenomen).map((s) => s.id)),
    away: new Set((kanten.find((k) => k.side === 'away')?.spelers ?? []).filter((s) => !alBevestigd || s.deelgenomen).map((s) => s.id)),
  }))
  const [bewaard, setBewaard] = useState(alBevestigd)
  const [bezig, setBezig] = useState(false)

  const wissel = (side: 'home' | 'away', id: number) => {
    setBewaard(false)
    setGekozen((g) => {
      const n = new Set(g[side])
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return { ...g, [side]: n }
    })
  }

  const bewaar = async () => {
    setBezig(true)
    try {
      const res = await fetch(`/api/matchsheet/${matchId}/deelname`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ home: [...gekozen.home], away: [...gekozen.away] }),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) return toast('error', d.error ?? 'Bewaren mislukt.')
      setBewaard(true)
      toast('success', 'Deelname bevestigd — staat nu bij elke speler.')
    } finally {
      setBezig(false)
    }
  }

  return (
    <section className="wb-card" id="deelname">
      <h2>Wie speelde?</h2>
      <p className="wb-sub">
        Vink aan wie effectief deelnam. Voorgevuld met de selectie van de coach.
        {bewaard ? ' ✓ Bevestigd.' : ''}
      </p>
      <div className="wb-grid">
        {kanten.map((k) => (
          <div key={k.side}>
            <h3 style={{ margin: '6px 0' }}>
              {k.teamNaam} <span className="wb-sub">· {gekozen[k.side].size}</span>
            </h3>
            {k.spelers.length === 0 ? (
              <p className="wb-sub">Geen selectie op het blad.</p>
            ) : (
              <ul className="wb-rows">
                {k.spelers.map((s) => (
                  <li
                    key={s.id}
                    className={`wb-row ${gekozen[k.side].has(s.id) ? 'on' : ''}`}
                    onClick={() => !vergrendeld && wissel(k.side, s.id)}
                    aria-disabled={vergrendeld}
                  >
                    <input type="checkbox" readOnly checked={gekozen[k.side].has(s.id)} disabled={vergrendeld} aria-label={`${s.naam} speelde`} />
                    <strong className="num">{s.rugnummer ?? '–'}</strong>
                    <span className="nm">{s.naam}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      {vergrendeld ? (
        <p className="wb-sub">Het blad is ingediend; de deelname ligt vast.</p>
      ) : (
        <button type="button" className="wb-btn wb-btn-primary" disabled={bezig} onClick={bewaar} style={{ marginTop: 10 }}>
          {bezig ? 'Bezig…' : bewaard ? 'Opnieuw bevestigen' : '✓ Deelname bevestigen'}
        </button>
      )}
    </section>
  )
}
