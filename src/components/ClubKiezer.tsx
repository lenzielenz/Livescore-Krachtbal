'use client'

import { useEffect, useRef, useState } from 'react'

import type { BeheerClub } from '@/lib/ploeg-rechtzetten'

// De club kiezen waar een ploeg onder hangt — via zoeken, niet via een keuzelijst.
//
// Er staan meer dan vierduizend competitieclubs in de database. Een <select> daarvan is op een gsm
// niet te doen, en elke cap erop snijdt precies de club weg die je zoekt. Zoeken heeft die grens
// niet: je typt drie letters van de clubnaam en ze staat er.
//
// Het zoekveld start met de naam die uit de ploegnaam volgt ("KBC St. Michiels A-1" → "KBC St.
// Michiels"), want dat is in negen van de tien gevallen precies wat je zoekt.

const WACHT_MS = 250

export function ClubKiezer({
  waarde,
  voorstel,
  onKies,
}: {
  /**
   * De club die de ploeg nu heeft. In principe altijd ingevuld — `club` is verplicht op een ploeg —
   * maar wél null als de club intussen verwijderd is, en dan hoort dat er ook zo te staan.
   */
  waarde: BeheerClub | null
  /** De clubnaam die uit de ingetypte ploegnaam volgt; vult het zoekveld voor. */
  voorstel: string
  onKies: (club: BeheerClub) => void
}) {
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [treffers, setTreffers] = useState<BeheerClub[]>([])
  const [stand, setStand] = useState<'rust' | 'zoeken' | 'fout'>('rust')
  const [meer, setMeer] = useState(false)
  const veld = useRef<HTMLInputElement>(null)

  // Elke zoekopdracht krijgt een volgnummer: een traag antwoord op een oude term mag een sneller
  // antwoord op een nieuwere term niet overschrijven.
  const beurt = useRef(0)

  useEffect(() => {
    if (!open) return
    const q = term.trim()
    if (q.length < 2) {
      setTreffers([])
      setMeer(false)
      setStand('rust')
      return
    }
    const mijn = ++beurt.current
    setStand('zoeken')
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clubs/zoek?q=${encodeURIComponent(q)}`, { credentials: 'include' })
        const json = (await res.json().catch(() => ({}))) as { clubs?: BeheerClub[]; meer?: boolean; error?: string }
        if (mijn !== beurt.current) return
        if (!res.ok) {
          setStand('fout')
          return
        }
        setTreffers(json.clubs ?? [])
        setMeer(Boolean(json.meer))
        setStand('rust')
      } catch {
        if (mijn === beurt.current) setStand('fout')
      }
    }, WACHT_MS)
    return () => clearTimeout(t)
  }, [term, open])

  const openen = () => {
    setOpen(true)
    setTerm(voorstel)
    // Na het openen staat de cursor in het zoekveld en is de voorgestelde naam geselecteerd, zodat
    // overtypen meteen werkt.
    setTimeout(() => veld.current?.select(), 0)
  }

  const kies = (club: BeheerClub) => {
    onKies(club)
    setOpen(false)
    setTerm('')
    setTreffers([])
  }

  return (
    <div className="wb-club">
      <span className="wb-club-lbl">Club (logo &amp; kleuren)</span>
      <div className="wb-club-nu">
        <strong className={waarde ? '' : 'leeg'}>{waarde ? waarde.naam : 'Geen club'}</strong>
        <button type="button" className="wb-beheer-link" onClick={() => (open ? setOpen(false) : openen())}>
          {open ? 'Sluiten' : 'Wijzigen'}
        </button>
      </div>

      {open && (
        <div className="wb-club-zoek">
          <input
            ref={veld}
            type="search"
            value={term}
            placeholder="Zoek een club op naam…"
            aria-label="Zoek een club op naam"
            onChange={(e) => setTerm(e.target.value)}
          />
          {term.trim().length < 2 ? (
            <p className="wb-beheer-tip dim">Typ minstens twee letters.</p>
          ) : stand === 'zoeken' ? (
            <p className="wb-beheer-tip dim">Zoeken…</p>
          ) : stand === 'fout' ? (
            <p className="wb-beheer-tip">Zoeken mislukt — probeer opnieuw.</p>
          ) : treffers.length === 0 ? (
            <p className="wb-beheer-tip dim">Geen club gevonden met die naam.</p>
          ) : (
            <>
              <ul className="wb-club-lijst">
                {treffers.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={`wb-club-keuze${waarde?.id === c.id ? ' actief' : ''}`}
                      onClick={() => kies(c)}
                    >
                      {c.naam}
                    </button>
                  </li>
                ))}
              </ul>
              {meer && <p className="wb-beheer-tip dim">Er zijn er meer — typ wat meer letters.</p>}
            </>
          )}
        </div>
      )}
    </div>
  )
}
