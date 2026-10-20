'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { toast } from '@/components/Toaster'
import { brusselsWallUtc } from '@/lib/datetime'

export type VerplaatsWedstrijd = {
  matchId: number
  titel: string
  reeks: string
  datumIso: string
  lokaal: string
  tijd: string
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Een datetime-local-waarde (Brusselse wandklok) → ISO in UTC. */
const naarUtc = (lokaal: string): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(lokaal)
  if (!m) return null
  return brusselsWallUtc(+m[1], +m[2], +m[3], +m[4], +m[5]).toISOString()
}

export function Verplaatsen({ wedstrijden }: { wedstrijden: VerplaatsWedstrijd[] }) {
  const router = useRouter()
  const [zoek, setZoek] = useState('')
  const [reeks, setReeks] = useState('')
  const [nieuw, setNieuw] = useState<Record<number, string>>({})
  const [bezig, setBezig] = useState(false)

  const reeksen = useMemo(
    () => [...new Set(wedstrijden.map((w) => w.reeks).filter(Boolean))].sort(),
    [wedstrijden],
  )
  const zichtbaar = wedstrijden.filter(
    (w) => (!reeks || w.reeks === reeks) && (!zoek || norm(w.titel).includes(norm(zoek))),
  )
  const wijzigingen = wedstrijden
    .filter((w) => nieuw[w.matchId] && nieuw[w.matchId] !== w.lokaal)
    .map((w) => ({ matchId: w.matchId, date: naarUtc(nieuw[w.matchId]) }))
    .filter((w): w is { matchId: number; date: string } => w.date != null)

  const bewaar = async () => {
    setBezig(true)
    try {
      const res = await fetch('/api/federatie/verplaatsen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ wijzigingen }),
      })
      const d = (await res.json().catch(() => ({}))) as {
        error?: string
        verplaatst?: number
        overgeslagen?: { reden: string }[]
      }
      if (!res.ok) {
        toast('error', d.error ?? 'Bewaren mislukt.')
        return
      }
      const over = d.overgeslagen?.length ?? 0
      toast(
        over ? 'info' : 'success',
        `${d.verplaatst ?? 0} verplaatst; beide clubs kregen een melding.${over ? ` ${over} niet (al bezig of gespeeld).` : ''}`,
      )
      setNieuw({})
      router.refresh()
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className="ft-wrap">
      <div className="ft-balk">
        <input
          className="ft-zoek"
          type="search"
          placeholder="Zoek ploeg…"
          value={zoek}
          onChange={(e) => setZoek(e.target.value)}
          aria-label="Zoek ploeg"
        />
        <select value={reeks} onChange={(e) => setReeks(e.target.value)} aria-label="Reeks">
          <option value="">Alle reeksen</option>
          {reeksen.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="ft-btn ft-primair"
          disabled={bezig || wijzigingen.length === 0}
          onClick={bewaar}
        >
          Bewaren ({wijzigingen.length})
        </button>
      </div>
      <div className="ft-lijst">
        {zichtbaar.map((w) => {
          const waarde = nieuw[w.matchId] ?? w.lokaal
          return (
            <div key={w.matchId} className={`ft-rij ${waarde !== w.lokaal ? 'ft-gewijzigd' : ''}`}>
              <div className="ft-wedstrijd">
                <strong>{w.titel}</strong>
                <small>
                  {waarde !== w.lokaal ? `was ${w.tijd}` : w.tijd}
                  {w.reeks ? ` · ${w.reeks}` : ''}
                </small>
              </div>
              <input
                type="datetime-local"
                value={waarde}
                onChange={(e) => setNieuw((m) => ({ ...m, [w.matchId]: e.target.value }))}
                aria-label={`Nieuwe datum voor ${w.titel}`}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
