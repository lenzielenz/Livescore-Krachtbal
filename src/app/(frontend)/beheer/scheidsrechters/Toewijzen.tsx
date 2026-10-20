'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { toast } from '@/components/Toaster'
import { formatDateBE } from '@/lib/datetime'
import { conflicten, vulAutomatisch, type PlanScheidsrechter } from '@/lib/scheidsrechter-planning'

export type ToewijsWedstrijd = {
  matchId: number
  dag: string
  aftrap: number
  tijd: string
  titel: string
  reeks: string
  clubs: (number | null)[]
  scheidsrechter: number | null
}

export function Toewijzen({ wedstrijden, refs }: { wedstrijden: ToewijsWedstrijd[]; refs: PlanScheidsrechter[] }) {
  const router = useRouter()
  const begin = useMemo(() => new Map(wedstrijden.map((w) => [w.matchId, w.scheidsrechter])), [wedstrijden])
  const [keuze, setKeuze] = useState<Map<number, number | null>>(() => new Map(begin))
  const [enkelLeeg, setEnkelLeeg] = useState(false)
  const [bezig, setBezig] = useState(false)

  const huidig = wedstrijden.map((w) => ({ ...w, scheidsrechter: keuze.get(w.matchId) ?? null }))
  const fouten = useMemo(() => {
    const m = new Map<number, string>()
    for (const c of conflicten(huidig, refs)) m.set(c.matchId, c.reden)
    return m
  }, [huidig, refs])
  const gewijzigd = wedstrijden.filter((w) => (keuze.get(w.matchId) ?? null) !== (begin.get(w.matchId) ?? null))
  const leeg = huidig.filter((w) => w.scheidsrechter == null).length
  const telPerRef = new Map<number, number>()
  for (const w of huidig) if (w.scheidsrechter != null) telPerRef.set(w.scheidsrechter, (telPerRef.get(w.scheidsrechter) ?? 0) + 1)

  const perDag = new Map<string, typeof huidig>()
  for (const w of huidig) {
    if (enkelLeeg && w.scheidsrechter != null && !fouten.has(w.matchId)) continue
    perDag.set(w.dag, [...(perDag.get(w.dag) ?? []), w])
  }

  const bewaar = async () => {
    setBezig(true)
    try {
      const res = await fetch('/api/federatie/toewijzingen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ toewijzingen: gewijzigd.map((w) => ({ matchId: w.matchId, officialId: keuze.get(w.matchId) ?? null })) }),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string; gewijzigd?: number }
      if (!res.ok) {
        toast('error', d.error ?? 'Bewaren mislukt.')
        return
      }
      toast('success', `${d.gewijzigd ?? 0} toewijzingen bewaard.`)
      router.refresh()
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className="ft-wrap">
      <div className="ft-balk">
        <span className="ft-stat">
          {leeg} zonder scheidsrechter · {fouten.size} conflict{fouten.size === 1 ? '' : 'en'}
        </span>
        <label className="ft-stat">
          <input type="checkbox" checked={enkelLeeg} onChange={(e) => setEnkelLeeg(e.target.checked)} /> enkel wat aandacht vraagt
        </label>
        <button
          type="button"
          className="ft-btn"
          disabled={leeg === 0}
          onClick={() => {
            const plan = vulAutomatisch(huidig, refs)
            setKeuze(new Map(plan.map((w) => [w.matchId, w.scheidsrechter])))
            const bij = plan.filter((w) => w.scheidsrechter != null).length - (huidig.length - leeg)
            toast('info', bij > 0 ? `${bij} voorgesteld — kijk na en bewaar.` : 'Niemand meer vrij voor de lege plaatsen.')
          }}
        >
          ✨ Vul automatisch
        </button>
        <button type="button" className="ft-btn ft-primair" disabled={bezig || gewijzigd.length === 0} onClick={bewaar}>
          Bewaren ({gewijzigd.length})
        </button>
      </div>

      {[...perDag.entries()].map(([dag, lijst]) => (
        <section key={dag} className="ft-dag">
          <h2>
            {formatDateBE(`${dag}T12:00:00Z`, { weekday: 'long', day: 'numeric', month: 'long' })} <small>· {lijst.length}</small>
          </h2>
          {lijst.map((w) => {
            const fout = fouten.get(w.matchId)
            const anders = (keuze.get(w.matchId) ?? null) !== (begin.get(w.matchId) ?? null)
            return (
              <div key={w.matchId} className={`ft-rij ${fout ? 'ft-conflict' : anders ? 'ft-gewijzigd' : w.scheidsrechter == null ? 'ft-leeg' : ''}`}>
                <div className="ft-wedstrijd">
                  <strong>{w.titel}</strong>
                  <small>
                    {w.tijd}
                    {w.reeks ? ` · ${w.reeks}` : ''}
                  </small>
                  {fout && <span className="ft-fout">⚠ {fout}</span>}
                </div>
                <select
                  value={w.scheidsrechter ?? ''}
                  onChange={(e) => setKeuze((m) => new Map(m).set(w.matchId, e.target.value ? Number(e.target.value) : null))}
                  aria-label={`Scheidsrechter voor ${w.titel}`}
                >
                  <option value="">— geen —</option>
                  {refs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.naam} ({telPerRef.get(r.id) ?? 0})
                    </option>
                  ))}
                </select>
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}
