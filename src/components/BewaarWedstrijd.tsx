'use client'

import { useEffect, useState } from 'react'

import { FAV_MATCHES_KEY, leesBewaard, wisselBewaard, type BewaardeWedstrijd } from '@/lib/fav-matches'
import './bewaar-wedstrijd.css'

// Sterretje om een wedstrijd in je eigen lijstje te zetten, klein genoeg om in een rij van een
// kalender of zoekresultaat te passen. Zelfde opslag als het grote blok op de wedstrijdpagina
// (fav-matches.ts): één lijstje, overal te vullen, terug te vinden op /zoeken.
export function BewaarWedstrijd({ wedstrijd }: { wedstrijd: BewaardeWedstrijd }) {
  const [bewaard, setBewaard] = useState(false)
  // Pas ná het opstarten lezen: op de server bestaat localStorage niet. Tot dan tonen we een leeg
  // sterretje i.p.v. te gokken — zo springt de knop niet van vol naar leeg.
  const [geladen, setGeladen] = useState(false)

  useEffect(() => {
    try {
      setBewaard(leesBewaard(localStorage.getItem(FAV_MATCHES_KEY)).some((w) => w.id === wedstrijd.id))
    } catch {
      /* geblokkeerde opslag: bewaren werkt dan gewoon niet */
    }
    setGeladen(true)
  }, [wedstrijd.id])

  const wissel = () => {
    try {
      const volgend = wisselBewaard(leesBewaard(localStorage.getItem(FAV_MATCHES_KEY)), wedstrijd)
      localStorage.setItem(FAV_MATCHES_KEY, JSON.stringify(volgend))
      setBewaard(volgend.some((w) => w.id === wedstrijd.id))
    } catch {
      /* stil falen is hier beter dan een foutmelding over browseropslag */
    }
  }

  const aan = geladen && bewaard
  return (
    <button
      type="button"
      className={`bewaar-ster${aan ? ' on' : ''}`}
      onClick={wissel}
      aria-pressed={aan}
      title={aan ? 'Uit mijn wedstrijden halen' : 'Bewaren bij mijn wedstrijden'}
      aria-label={
        aan
          ? `${wedstrijd.home} – ${wedstrijd.away} uit mijn wedstrijden halen`
          : `${wedstrijd.home} – ${wedstrijd.away} bewaren bij mijn wedstrijden`
      }
    >
      {aan ? '★' : '☆'}
    </button>
  )
}
