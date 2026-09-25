'use client'

import { useState } from 'react'

import type { GroepTotaal } from '@/lib/erelijst'

const TOON_AANTAL = 8

// "Totaal per reeks"/"Totaal per categorie"-kaart op de clubpagina — bij een club met tientallen
// jaren geschiedenis (en dus evenveel verschillende reeksen) werd deze kaart torenhoog. Toont nu
// enkel de top TOON_AANTAL rijen (al gesorteerd op aantal, dus de belangrijkste eerst) met een
// "Toon alle ↓"-knop eronder — zelfde uitklap-patroon als de seizoenskaarten op de hoofdpagina
// (ErelijstBrowser.tsx, .erl-meer).
export function ReeksTotaalKaart({ titel, woord = 'reeksen', data }: { titel: string; woord?: string; data: GroepTotaal[] }) {
  const [toonAlles, setToonAlles] = useState(false)
  const rijen = toonAlles ? data : data.slice(0, TOON_AANTAL)

  return (
    <div className="erl-kaart erl-reeks-totaal">
      <h3 className="erl-kaart-titel">{titel}</h3>
      <ul className="erl-kaart-rijen erl-kaart-rijen-grid">
        {rijen.map((r) => (
          <li key={r.naam} className="erl-kaart-rij">
            <span className="erl-kaart-label">{r.naam}</span>
            <span className="erl-kaart-waarde">{r.aantal}×</span>
          </li>
        ))}
      </ul>
      {!toonAlles && data.length > TOON_AANTAL && (
        <button type="button" className="erl-meer" onClick={() => setToonAlles(true)}>
          Toon alle {data.length} {woord} ↓
        </button>
      )}
    </div>
  )
}
