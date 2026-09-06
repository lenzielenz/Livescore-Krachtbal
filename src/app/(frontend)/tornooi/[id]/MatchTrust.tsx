'use client'

import { useState } from 'react'

import { TRUST_TEXT } from '@/lib/score-trust'
import type { TMatchState, TournamentState } from '@/lib/tournament-engine'

type Stem = 'bevestig' | 'betwist'

/**
 * Vertrouwensstrookje onder een tornooiwedstrijd — enkel zichtbaar zodra een supporter deze
 * wedstrijd meetelt. Aan een tornooidag staan er tien velden tegelijk te spelen en zit er lang
 * niet achter elk veld iemand van de organisatie; dan telt een supporter mee en hoort erbij te
 * staan wie dat is en of andere kijkers het beeld bevestigen.
 *
 * Zelfde regels als bij een gewone wedstrijd (src/lib/score-trust.ts) — hier enkel de UI, in het
 * compacte formaat van een wedstrijdkaart. De volledige uitleg staat op de wedstrijdpagina.
 */
export function MatchTrust({
  tournamentId,
  m,
  ingelogd,
  supportersModus,
  gebruikerId,
  onState,
}: {
  tournamentId: number
  m: TMatchState
  ingelogd: boolean
  supportersModus: boolean
  gebruikerId: number | null
  onState?: (s: TournamentState) => void
}) {
  const [stem, setStem] = useState<Stem | null>(null)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const trust = m.trust
  if (!trust) return null
  const tekst = TRUST_TEXT[trust.label]

  // Een knop die altijd een fout geeft hoort er niet te staan — dus toetsen we hier exact wat de
  // server toetst: supporters-modus, ingelogd, niet je eigen werk, niet eerder meegetekend
  // (mayVote), en het stemvenster nog open (24 u na afsluiten). Die laatste twee kon de client
  // vroeger niet weten; ze reizen nu mee in het trust-blok.
  const magStemmen =
    supportersModus &&
    ingelogd &&
    gebruikerId != null &&
    trust.scorerId !== gebruikerId &&
    !trust.contributorIds.includes(gebruikerId) &&
    trust.stemVensterOpen

  const stuur = async (actie: Stem) => {
    if (bezig) return
    setBezig(true)
    setFout(null)
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/match/${m.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: actie }),
      })
      const data = (await res.json().catch(() => null)) as { state?: TournamentState; error?: string } | null
      if (!res.ok || !data?.state) {
        setFout(data?.error ?? 'Er ging iets mis.')
        return
      }
      setStem(actie)
      onState?.(data.state)
    } catch {
      setFout('Geen verbinding — probeer het opnieuw.')
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className={`trn-trust ${trust.label}`} onClick={(e) => e.stopPropagation()}>
      {/* Enkel het oordeel over de stand. Wie ze doorgaf staat één regel lager, in de vermelding
          die bij élke wedstrijd hoort — anders zou dezelfde naam hier twee keer staan. */}
      <div className="trn-trust-kop">
        <span className="trn-trust-label">
          <span aria-hidden>{tekst.emoji}</span> {tekst.short}
        </span>
      </div>
      {(trust.confirms > 0 || trust.disputes > 0) && (
        <p className="trn-trust-tel">
          {trust.confirms > 0 && <span className="ok">{trust.confirms}× bevestigd</span>}
          {trust.disputes > 0 && <span className="nok">{trust.disputes}× betwist</span>}
        </p>
      )}
      {magStemmen && (
        <div className="trn-trust-knoppen">
          <button
            type="button"
            className={`trn-mini ${stem === 'bevestig' ? 'aan' : ''}`}
            disabled={bezig}
            onClick={() => void stuur('bevestig')}
          >
            👍 Klopt
          </button>
          <button
            type="button"
            className={`trn-mini ${stem === 'betwist' ? 'aan' : ''}`}
            disabled={bezig}
            onClick={() => void stuur('betwist')}
          >
            👎 Klopt niet
          </button>
        </div>
      )}
      {fout && <p className="trn-trust-fout">{fout}</p>}
    </div>
  )
}
