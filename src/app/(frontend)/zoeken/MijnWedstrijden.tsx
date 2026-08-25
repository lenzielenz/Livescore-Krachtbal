'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { formatDateTimeBE } from '@/lib/datetime'
import {
  agendaLinkVoor,
  FAV_MATCHES_KEY,
  leesBewaard,
  nogTeSpelen,
  wisselBewaard,
  type BewaardeWedstrijd,
} from '@/lib/fav-matches'

// De wedstrijden die je op een matchpagina bewaarde, samen op één plek — met één agenda-bestand
// voor het hele lijstje. Het staat lokaal in je browser, dus dit blok wordt pas ná het laden
// ingevuld en blijft leeg (en dus onzichtbaar) als je nog niets bewaarde.
export function MijnWedstrijden() {
  const [lijst, setLijst] = useState<BewaardeWedstrijd[]>([])

  useEffect(() => {
    try {
      setLijst(nogTeSpelen(leesBewaard(localStorage.getItem(FAV_MATCHES_KEY))))
    } catch {
      /* geblokkeerde opslag: dan is er gewoon niets te tonen */
    }
  }, [])

  const verwijder = (w: BewaardeWedstrijd) => {
    try {
      const volgend = wisselBewaard(leesBewaard(localStorage.getItem(FAV_MATCHES_KEY)), w)
      localStorage.setItem(FAV_MATCHES_KEY, JSON.stringify(volgend))
      setLijst(nogTeSpelen(volgend))
    } catch {
      /* stil falen: het lijstje blijft dan staan zoals het was */
    }
  }

  if (lijst.length === 0) return null
  const agenda = agendaLinkVoor(lijst)

  return (
    <section className="zk-mijne">
      <h2 className="zk-mijne-titel">★ Mijn wedstrijden</h2>
      <ul className="zk-mijne-lijst">
        {lijst.map((w) => (
          <li key={w.id} className="zk-mijne-item">
            <Link href={`/match/${w.id}`} className="zk-mijne-link">
              <span className="zk-mijne-ploegen">
                {w.home} – {w.away}
              </span>
              <span className="zk-mijne-wanneer">
                {w.date ? formatDateTimeBE(w.date) : 'datum nog niet gekend'}
                {w.reeks ? ` · ${w.reeks}` : ''}
              </span>
            </Link>
            <button
              type="button"
              className="zk-mijne-weg"
              onClick={() => verwijder(w)}
              aria-label={`${w.home} – ${w.away} uit mijn lijstje halen`}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      {agenda && (
        <p className="zk-alles">
          <a className="zk-knop klein" href={agenda}>
            📅 Alles in mijn agenda (.ics, met melding)
          </a>
        </p>
      )}
    </section>
  )
}
