'use client'

import { useEffect, useMemo, useState } from 'react'

// Vaste, openbare kantine-link per club: kies je club en deel/plak de link op de kantine-tv. Hij
// blijft heel het seizoen geldig en toont automatisch al jullie wedstrijden van die dag.
//
// DECISION 2026-09-06: de kop zegt nu expliciet "automatisch" en de tekst dat je hieronder niets
// hoeft aan te vinken. Deze pagina toont twee schermen onder elkaar — deze clublink én de
// handmatige selectie eronder — en dat verschil stond nergens. Een clubverantwoordelijke vroeg
// daardoor of de vaste link alle live wedstrijden van zijn club toont, en of de zelfgekozen lijst
// eronder daar dan bij hoort. Twee schermen die op elkaar lijken moeten zichzelf uitleggen.
export function KantineClubLink({ clubs, myClubId }: { clubs: { id: number; name: string }[]; myClubId?: number | null }) {
  const [clubId, setClubId] = useState<number | null>(myClubId ?? (clubs.length === 1 ? clubs[0].id : null))
  const [copied, setCopied] = useState(false)

  // De volledige link heeft het domein nodig, maar dat kent de server niet: gebruik je
  // window.location tijdens het renderen, dan verschilt de server-HTML van wat de browser
  // maakt en klaagt React over de hydratatie. Daarom pas ná de eerste render invullen.
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])

  const url = useMemo(() => (clubId == null ? '' : `${origin}/kantine/club/${clubId}`), [clubId, origin])

  if (clubs.length === 0) return null

  return (
    <section className="kt-clublink">
      <h2 className="kt-clublink-title">📺 Of: het kale clubscherm, zonder aanmelden</h2>
      <p className="kt-clublink-sub">
        Wil je niets instellen? Deze vaste link toont <strong>alle wedstrijden van één club van
        vandaag</strong> en werkt ook zonder account. Hij kan niets extra's tonen — geen ploegen of
        wedstrijden van andere clubs. Voor dat laatste maak je hierboven je eigen scherm.
      </p>
      <div className="kt-clublink-row">
        <select
          className="kt-clublink-select"
          value={clubId ?? ''}
          onChange={(e) => { setClubId(e.target.value ? Number(e.target.value) : null); setCopied(false) }}
          aria-label="Club"
        >
          <option value="">— kies een club —</option>
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {url && (
          <>
            <input className="kt-clublink-url" value={url} readOnly onFocus={(e) => e.currentTarget.select()} />
            <button
              type="button"
              className="kt-clublink-btn"
              onClick={() => { void navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
            >
              {copied ? '✓ Gekopieerd' : '🔗 Kopieer'}
            </button>
            <a className="kt-clublink-btn open" href={url} target="_blank" rel="noopener noreferrer">Openen ↗</a>
          </>
        )}
      </div>
    </section>
  )
}
