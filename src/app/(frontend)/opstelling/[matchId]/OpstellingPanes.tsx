'use client'

import Link from 'next/link'
import { useCallback, useState } from 'react'

import { OpstellingEditor } from './OpstellingEditor'

// Beide opstellingskaarten + de doorstroom naar stap 2: zodra thuis én uit klaar zijn
// (genoeg spelers en bewaard, of bevestigd), verschijnt onderaan een knop naar de
// scheidsrechter-stap. Sticky, zodat hij ook op gsm meteen in beeld is.
export function OpstellingPanes({
  matchId,
  homeLabel,
  awayLabel,
}: {
  matchId: string
  homeLabel: string
  awayLabel: string
}) {
  const [homeReady, setHomeReady] = useState(false)
  const [awayReady, setAwayReady] = useState(false)
  const onHomeReady = useCallback((r: boolean) => setHomeReady(r), [])
  const onAwayReady = useCallback((r: boolean) => setAwayReady(r), [])
  const allReady = homeReady && awayReady

  return (
    <>
      <div className="wb-grid">
        <OpstellingEditor matchId={matchId} side="home" label={homeLabel} onReadyChange={onHomeReady} />
        <OpstellingEditor matchId={matchId} side="away" label={awayLabel} onReadyChange={onAwayReady} />
      </div>
      {allReady && (
        <div className="ops-next">
          <span className="ops-next-msg">✓ Beide opstellingen zijn klaar.</span>
          <Link href={`/scheidsrechter/${matchId}`} className="wb-btn wb-btn-primary ops-next-btn">
            Naar stap 2 — Scheidsrechter →
          </Link>
        </div>
      )}
    </>
  )
}
