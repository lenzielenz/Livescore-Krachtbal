'use client'

import { useState } from 'react'

import { ClubKiezer } from '@/components/ClubKiezer'
import type { BeheerClub, BeheerPloeg } from '@/lib/ploeg-rechtzetten'
import { CATEGORY_OPTIONS } from '@/lib/categories'
import { REEKS_OPTIONS, reeksCategorie, type Reeks } from '@/lib/reeksen'
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
  bewaar: (velden: { naam: string; clubId: number | null; reeks: string }) => Promise<boolean>
  voetnoot?: string
}) {
  const [naam, setNaam] = useState(ploeg.naam)
  const [gekozen, setGekozen] = useState<BeheerClub | null>(club)
  const [reeks, setReeks] = useState(ploeg.reeks ?? '')

  const ongewijzigd =
    naam === ploeg.naam && (gekozen?.id ?? null) === (club?.id ?? null) && reeks === (ploeg.reeks ?? '')

  // De categorie volgt uit de reeks en wordt mee weggeschreven; ze staat erbij zodat je ziet wat je
  // meeverandert. Dat is niet cosmetisch: aan de categorie hangen de balkleur, de worpregels, de
  // duur van een helft en de leeftijdsgrens van de fototribune.
  const categorie = reeks ? reeksCategorie(reeks as Reeks) : null
  const categorieWijzigt = categorie !== null && reeks !== (ploeg.reeks ?? '')

  return (
    <div className="wb-beheer-rij">
      <span className="wb-beheer-lbl">{titel}</span>
      <div className="wb-beheer-velden">
        <label className="wb-beheer-veld breed">
          <span>Ploegnaam</span>
          <input type="text" value={naam} onChange={(e) => setNaam(e.target.value)} />
        </label>
        <label className="wb-beheer-veld breed">
          <span>Reeks / niveau</span>
          <select value={reeks} onChange={(e) => setReeks(e.target.value)}>
            <option value="">— Geen reeks —</option>
            {REEKS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="wb-beheer-btn primair"
          disabled={busy !== null || !naam.trim() || ongewijzigd}
          onClick={() => void bewaar({ naam, clubId: gekozen?.id ?? null, reeks })}
        >
          {busy === sleutel ? 'Bezig…' : 'Opslaan'}
        </button>
      </div>

      {categorieWijzigt && (
        <p className="wb-beheer-tip">
          Categorie wordt <strong>{CATEGORY_OPTIONS.find((o) => o.value === categorie)?.label ?? categorie}</strong> —
          die volgt uit de reeks en bepaalt de balkleur en de speelduur.
        </p>
      )}

      <ClubKiezer waarde={gekozen} voorstel={clubVanPloeg(naam)} onKies={setGekozen} />

      <p className="wb-beheer-tip dim">{voetnoot}</p>
    </div>
  )
}
