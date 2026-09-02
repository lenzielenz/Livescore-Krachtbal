'use client'

import { useEffect, useState } from 'react'

import { FAV_MATCHES_KEY, leesBewaard, wisselBewaard, type BewaardeWedstrijd } from '@/lib/fav-matches'

// Een wedstrijd die pas over weken gespeeld wordt, heeft geen scorebord nodig: er valt niets te
// volgen en niets door te geven. Wat je dán wil, is ze onthouden en in je agenda zetten.
//
// Het lijstje staat lokaal in je browser — geen account nodig. Je vindt het terug op
// "Wanneer spelen we?" (/zoeken), met één agenda-bestand voor alles wat je bewaarde.
export function ToekomstigeWedstrijd({
  wedstrijd,
  googleUrl,
}: {
  wedstrijd: BewaardeWedstrijd
  googleUrl: string
}) {
  const [bewaard, setBewaard] = useState(false)
  // Pas ná het opstarten lezen: op de server bestaat localStorage niet, en zo blijft de knop
  // tijdens het laden stil i.p.v. van "niet bewaard" naar "bewaard" te springen.
  const [geladen, setGeladen] = useState(false)

  useEffect(() => {
    try {
      const lijst = leesBewaard(localStorage.getItem(FAV_MATCHES_KEY))
      setBewaard(lijst.some((w) => w.id === wedstrijd.id))
    } catch {
      /* privémodus of geblokkeerde opslag: dan werkt bewaren gewoon niet */
    }
    setGeladen(true)
  }, [wedstrijd.id])

  const wissel = () => {
    try {
      const lijst = leesBewaard(localStorage.getItem(FAV_MATCHES_KEY))
      const volgend = wisselBewaard(lijst, wedstrijd)
      localStorage.setItem(FAV_MATCHES_KEY, JSON.stringify(volgend))
      setBewaard(volgend.some((w) => w.id === wedstrijd.id))
    } catch {
      /* stil falen is hier beter dan een foutmelding over browseropslag */
    }
  }

  return (
    <section className="match-toekomst">
      <p className="match-toekomst-lead">
        Deze wedstrijd moet nog gespeeld worden. Zet ze klaar, dan mis je ze niet.
      </p>
      <div className="match-toekomst-knoppen">
        <button
          type="button"
          className={`match-toekomst-btn${bewaard ? ' on' : ''}`}
          onClick={wissel}
          aria-pressed={bewaard}
        >
          {geladen && bewaard ? '★ Bewaard' : '☆ Bewaar deze wedstrijd'}
        </button>
      </div>
      {/* De agenda-links zijn bijzaak: één rustige regel onder de hoofdknop in plaats van twee
          knoppen die evenveel gewicht opeisen als "bewaar deze wedstrijd". */}
      <p className="match-toekomst-agenda">
        In je agenda:
        {googleUrl && (
          <>
            {' '}
            <a href={googleUrl} target="_blank" rel="noopener noreferrer">Google</a>
          </>
        )}
        {googleUrl && ' · '}
        <a href={`/api/match/${wedstrijd.id}/ics`}>met melding (.ics)</a>
      </p>
      {geladen && bewaard && (
        <p className="match-toekomst-hint">
          Staat in je lijstje. Je vindt het terug bij <a href="/zoeken">Wanneer spelen we?</a>
        </p>
      )}
    </section>
  )
}
