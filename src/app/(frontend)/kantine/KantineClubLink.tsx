'use client'

import { useEffect, useState } from 'react'

import { CastKnop } from '@/components/CastKnop'

// Snel één club op de tv: het eerste wat je op /kantine ziet. Club kiezen, scherm openen — geen
// account, geen instellingen. De link is openbaar en blijft heel het seizoen geldig; hij toont
// automatisch alle wedstrijden van die club.
//
// 2026-10-19: stond onderaan, dichtgeklapt onder "Alleen snel één club tonen?". Wie het scherm
// gewoon wil zien, moest eerst door een uitleg in vier stappen scrollen. Nu staat dit bovenaan en
// open; het persoonlijke scherm (meerdere clubs, losse ploegen) staat eronder.

/** Laatst gekozen club op dit toestel — enkel gemak, nooit nodig om te werken. */
const BEWAAR_KEY = 'kb-kantine-snelclub'

export function KantineClubLink({ clubs, myClubId }: { clubs: { id: number; name: string }[]; myClubId?: number | null }) {
  const [clubId, setClubId] = useState<number | null>(myClubId ?? (clubs.length === 1 ? clubs[0].id : null))
  const [copied, setCopied] = useState(false)

  // De volledige link heeft het domein nodig, maar dat kent de server niet: pas ná de eerste
  // render invullen, anders verschilt de server-HTML van die in de browser (hydratatie).
  const [origin, setOrigin] = useState('')
  useEffect(() => {
    setOrigin(window.location.origin)
    // Zonder eigen club: neem de club van de vorige keer op dit toestel.
    if (myClubId != null) return
    try {
      const vorige = Number(window.localStorage.getItem(BEWAAR_KEY))
      if (clubs.some((c) => c.id === vorige)) setClubId(vorige)
    } catch {
      /* geen opslag (privévenster) — dan kies je gewoon opnieuw */
    }
  }, [clubs, myClubId])

  if (clubs.length === 0) return null

  const pad = clubId == null ? '' : `/kantine/club/${clubId}`
  const kies = (id: number | null) => {
    setClubId(id)
    setCopied(false)
    try {
      if (id != null) window.localStorage.setItem(BEWAAR_KEY, String(id))
    } catch {
      /* zie hierboven */
    }
  }

  return (
    <section className="kt-snel" aria-labelledby="kt-snel-titel">
      <span className="kt-snel-eyebrow">⚡ Meteen op de tv</span>
      <h2 id="kt-snel-titel" className="kt-snel-titel">Toon de wedstrijden van één club</h2>
      <p className="kt-snel-sub">Kies je club en open het scherm. Live standen en de volgende wedstrijden komen er vanzelf op.</p>

      <select
        className="kt-snel-select"
        value={clubId ?? ''}
        onChange={(e) => kies(e.target.value ? Number(e.target.value) : null)}
        aria-label="Kies je club"
      >
        <option value="">Kies je club…</option>
        {clubs.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      {pad ? (
        <div className="kt-snel-acties">
          <a className="kt-snel-open" href={pad} target="_blank" rel="noopener noreferrer">📺 Open scherm</a>
          <CastKnop pad={pad} sleutel={`kantine-club-${clubId}`} label="📡 Cast" klasse="kt-snel-knop" />
          <button
            type="button"
            className="kt-snel-knop"
            onClick={() => {
              void navigator.clipboard?.writeText(`${origin}${pad}`)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }}
          >
            {copied ? '✓ Gekopieerd' : '🔗 Kopieer link'}
          </button>
        </div>
      ) : (
        <p className="kt-snel-hint">Kies hierboven een club — daarna verschijnt de knop om het scherm te openen.</p>
      )}
    </section>
  )
}
