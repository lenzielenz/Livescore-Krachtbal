'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useState } from 'react'

import { ErrorCatch } from '@/components/ErrorCatch'
import type { ShotPoint } from '@/lib/match-engine'
import './match-stats.css'

// Het 3D-wedstrijdverloop als extra bij elke wedstrijd: één knop op de wedstrijdpagina, en pas als
// je erop tikt worden de worpen opgehaald (/api/match/[id]/verloop) en three geladen. De rest van
// de pagina blijft precies zoals ze was. Het beeld opent over het hele scherm; sluiten met de knop
// of Escape.

const Verloop3D = dynamic(() => import('@/components/Verloop3D').then((m) => m.Verloop3D), {
  ssr: false,
  loading: () => <p className="empty">3D laden…</p>,
})

type Gegevens = {
  status: string
  teams: { home: string; away: string }
  colors: { home: string | null; away: string | null; homeB?: string | null; awayB?: string | null }
  goalAreaDepth: number | null
  speelveldM: number | null
  matchLabel: string
  shots: ShotPoint[]
}

export function Verloop3DKnop({ matchId }: { matchId: number }) {
  const [open, setOpen] = useState(false)
  const [gegevens, setGegevens] = useState<Gegevens | null>(null)
  const [laden, setLaden] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  const haal = useCallback(async () => {
    setLaden(true)
    setFout(null)
    try {
      const res = await fetch(`/api/match/${matchId}/verloop`, { cache: 'no-store' })
      const d = (await res.json().catch(() => ({}))) as Gegevens & { error?: string }
      if (!res.ok) throw new Error(d.error ?? 'Laden mislukt.')
      setGegevens(d)
    } catch (err) {
      setFout((err as Error).message || 'Laden mislukt.')
    } finally {
      setLaden(false)
    }
  }, [matchId])

  const openen = () => {
    setOpen(true)
    if (!gegevens) void haal()
  }

  useEffect(() => {
    if (!open) return
    const toets = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', toets)
    // De pagina eronder niet laten meescrollen.
    const vorige = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', toets)
      document.body.style.overflow = vorige
    }
  }, [open])

  return (
    <>
      <button type="button" className="verloop3d-open" onClick={openen}>
        🏟️ Wedstrijdverloop in 3D
      </button>
      {open && (
        <div className="verloop3d-laag" role="dialog" aria-modal="true" aria-label="Wedstrijdverloop in 3D">
          <div className="verloop3d-paneel">
            <div className="verloop3d-kop">
              <strong>Wedstrijdverloop in 3D</strong>
              <span className="verloop3d-knoppen">
                {gegevens?.status === 'live' && (
                  <button type="button" onClick={() => void haal()} disabled={laden}>
                    {laden ? 'Bezig…' : '↻ Vernieuwen'}
                  </button>
                )}
                <button type="button" onClick={() => setOpen(false)} aria-label="Sluiten">
                  ✕ Sluiten
                </button>
              </span>
            </div>
            {fout ? (
              <p className="empty">Het wedstrijdverloop kon niet laden: {fout}</p>
            ) : !gegevens ? (
              <p className="empty">Laden…</p>
            ) : (
              <ErrorCatch label="Het 3D-wedstrijdverloop" fallback={(err) => <p className="empty">Het 3D-wedstrijdverloop kon niet laden. {err.message}</p>}>
                <Verloop3D
                  shots={gegevens.shots}
                  teams={gegevens.teams}
                  colors={gegevens.colors}
                  goalAreaDepth={gegevens.goalAreaDepth ?? undefined}
                  speelveldM={gegevens.speelveldM ?? undefined}
                  matchLabel={gegevens.matchLabel}
                />
              </ErrorCatch>
            )}
          </div>
        </div>
      )}
    </>
  )
}
