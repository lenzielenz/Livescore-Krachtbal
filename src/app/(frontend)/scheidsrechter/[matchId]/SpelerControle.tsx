'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { toast } from '@/components/Toaster'

export type ControleRij = {
  id: number
  rugnummer: number | null
  naam: string
  /** Waarom deze speler volgens het reglement niet mag spelen, of null als alles in orde is. */
  blokkade: string | null
  gecontroleerd: boolean
}

/**
 * De scheidsrechter controleert elke speler op de lijst: "jij bent die speler, alles in orde". Wie
 * volgens het reglement niet in orde is, staat in het rood en kan niet gecontroleerd worden. Pas als
 * iedereen gecontroleerd is, kan hij de wedstrijd vrijgeven.
 */
export function SpelerControle({
  matchId,
  side,
  titel,
  rijen,
  vergrendeld,
}: {
  matchId: string
  side: 'home' | 'away'
  titel: string
  rijen: ControleRij[]
  vergrendeld: boolean
}) {
  const router = useRouter()
  const [ok, setOk] = useState<Set<number>>(new Set(rijen.filter((r) => r.gecontroleerd).map((r) => r.id)))
  const [bezig, setBezig] = useState(false)

  const zet = async (body: Record<string, unknown>) => {
    setBezig(true)
    try {
      const res = await fetch(`/api/matchsheet/${matchId}/referee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'controle', side, ...body }),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string; gecontroleerd?: number[] }
      if (!res.ok) return toast('error', d.error ?? 'Bewaren mislukt.')
      setOk(new Set(d.gecontroleerd ?? []))
      router.refresh() // de vrijgave-kaart telt mee
    } finally {
      setBezig(false)
    }
  }

  const inOrde = rijen.filter((r) => !r.blokkade)
  const alles = rijen.length > 0 && rijen.every((r) => ok.has(r.id))
  return (
    <section className="wb-card">
      <h2>{titel}</h2>
      {rijen.length === 0 ? (
        <p className="wb-sub">Nog geen opstelling ingevuld.</p>
      ) : (
        <>
          {alles ? (
            <div className="ops-ready ok">✓ Alle spelers gecontroleerd</div>
          ) : (
            <div className="ops-ready todo">
              {ok.size}/{rijen.length} gecontroleerd — vraag elke speler wie hij is en kijk na.
            </div>
          )}
          <ul className="wb-rows">
            {rijen.map((r) => (
              <li key={r.id} className={`wb-row ${r.blokkade ? 'lvl-block' : ''}`} style={{ cursor: 'default' }}>
                <strong className="num">{r.rugnummer ?? '–'}</strong>
                <span className="nm">
                  <span className="wb-nm-name">{r.naam}</span>
                  {r.blokkade ? <span className="wb-reason lvl-block">⛔ {r.blokkade}</span> : <span className="wb-reason">✓ in orde volgens het reglement</span>}
                </span>
                {!r.blokkade && (
                  <button
                    type="button"
                    className={`wb-btn ${ok.has(r.id) ? 'wb-btn-primary' : ''}`}
                    disabled={bezig || vergrendeld}
                    aria-pressed={ok.has(r.id)}
                    onClick={() => zet({ playerId: r.id, ok: !ok.has(r.id) })}
                  >
                    {ok.has(r.id) ? '✓ Gecontroleerd' : 'Controleren'}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!alles && !vergrendeld && inOrde.length === rijen.length && (
            <button type="button" className="wb-btn" disabled={bezig} onClick={() => zet({ alle: true, ok: true })} style={{ marginTop: 8 }}>
              ✓ Iedereen gecontroleerd
            </button>
          )}
        </>
      )}
    </section>
  )
}
