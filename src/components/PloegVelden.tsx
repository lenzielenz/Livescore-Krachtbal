'use client'

import { useState } from 'react'

import { ClubKiezer } from '@/components/ClubKiezer'
import type { BeheerClub, BeheerPloeg } from '@/lib/ploeg-rechtzetten'
import { clubVanPloeg } from '@/lib/season-import'

import './beheer-velden.css'

export type { BeheerClub, BeheerPloeg }

// De velden om één ploeg recht te zetten: haar naam, en de club waar ze onder hangt.
//
// Gedeeld door de wedstrijdpagina (twee van deze, thuis en uit) en de ploegpagina zelf. Waarom de
// club erbij staat: het logo en de kleuren komen van de CLUB, niet van de ploeg. "KBC St. Michiels
// A" onder een eigen club "KBC St. Michiels A" toont geen logo; onder "KBC St. Michiels" wel.
//
// De club zoek je (zie ClubKiezer) in plaats van ze uit een lijst te kiezen — er staan er te veel
// in de database om er een lijst van te maken. Het zoekveld begint bij de clubnaam die uit de
// ingetypte ploegnaam volgt, met dezelfde regel als de import.

export function PloegVelden({
  titel,
  ploeg,
  club,
  busy,
  sleutel,
  bewaar,
  voetnoot = 'De ploegnaam geldt overal — ook op haar wedstrijden en in de rangschikking.',
}: {
  titel: string
  ploeg: BeheerPloeg
  /** De club die de ploeg nu heeft, met haar naam — of null. */
  club: BeheerClub | null
  busy: string | null
  sleutel: string
  bewaar: (velden: { naam: string; clubId: number | null }) => Promise<boolean>
  voetnoot?: string
}) {
  const [naam, setNaam] = useState(ploeg.naam)
  const [gekozen, setGekozen] = useState<BeheerClub | null>(club)

  const ongewijzigd = naam === ploeg.naam && (gekozen?.id ?? null) === (club?.id ?? null)

  return (
    <div className="wb-beheer-rij">
      <span className="wb-beheer-lbl">{titel}</span>
      <div className="wb-beheer-velden">
        <label className="wb-beheer-veld breed">
          <span>Ploegnaam</span>
          <input type="text" value={naam} onChange={(e) => setNaam(e.target.value)} />
        </label>
        <button
          type="button"
          className="wb-beheer-btn primair"
          disabled={busy !== null || !naam.trim() || ongewijzigd}
          onClick={() => void bewaar({ naam, clubId: gekozen?.id ?? null })}
        >
          {busy === sleutel ? 'Bezig…' : 'Opslaan'}
        </button>
      </div>

      <ClubKiezer waarde={gekozen} voorstel={clubVanPloeg(naam)} onKies={setGekozen} />

      <p className="wb-beheer-tip dim">{voetnoot}</p>
    </div>
  )
}
