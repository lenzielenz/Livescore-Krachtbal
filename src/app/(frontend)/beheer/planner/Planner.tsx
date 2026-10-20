'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { toast } from '@/components/Toaster'
import { brusselsParts, brusselsWallUtc, dateStrBE, formatDateBE, formatDateTimeBE, formatTimeBE, shiftDateStr, zaterdagVan } from '@/lib/datetime'
import type { VerplaatsingRij } from '@/lib/verplaatsing'

// De planner: speelweekends als kolommen. Een wedstrijd verplaatsen = slepen naar een ander weekend,
// of aantikken en dan het weekend aantikken (werkt ook op een tablet). Dag en uur blijven; enkel het
// weekend verandert. Gekoppelde wedstrijden (zelfde clubs, zelfde terrein, zelfde weekend) gaan mee.
// Weekends waar het niet kan, worden grijs met de reden; wat botst, staat rood in de kaart.

export type PlannerWedstrijd = {
  id: number
  reeks: string
  datum: string
  afgelast: boolean
  thuis: { id: number; naam: string; club: number; clubNaam: string }
  uit: { id: number; naam: string; club: number; clubNaam: string }
}
type Onb = { club: number; weekend: string; hard: boolean; reden: string | null }

const weekendVan = (iso: string) => zaterdagVan(dateStrBE(new Date(iso)))
const dagenTussen = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)

export function Planner({
  wedstrijden,
  onbeschikbaar,
  vrijeWeekends,
  aanvragen,
}: {
  wedstrijden: PlannerWedstrijd[]
  onbeschikbaar: Onb[]
  vrijeWeekends: { weekend: string; reden: string | null }[]
  aanvragen: VerplaatsingRij[]
}) {
  const router = useRouter()
  /** matchId → nieuwe ISO-datum (enkel wat verschilt van de databank). */
  const [wijz, setWijz] = useState<Record<number, string>>({})
  const [geschiedenis, setGeschiedenis] = useState<Record<number, string>[]>([])
  const [gekozen, setGekozen] = useState<number | null>(null)
  const [samen, setSamen] = useState(true)
  const [reeks, setReeks] = useState<string>('')
  const [club, setClub] = useState<string>('')
  const [bezig, setBezig] = useState(false)

  const datumVan = (w: PlannerWedstrijd) => wijz[w.id] ?? w.datum
  const reeksen = useMemo(() => [...new Set(wedstrijden.map((w) => w.reeks))].sort(), [wedstrijden])
  const clubs = useMemo(() => {
    const m = new Map<number, string>()
    for (const w of wedstrijden) {
      m.set(w.thuis.club, w.thuis.clubNaam)
      m.set(w.uit.club, w.uit.clubNaam)
    }
    return [...m].sort((a, b) => a[1].localeCompare(b[1]))
  }, [wedstrijden])

  const onbMap = useMemo(() => new Map(onbeschikbaar.map((o) => [`${o.club}|${o.weekend}`, o])), [onbeschikbaar])
  const vrijMap = useMemo(() => new Map(vrijeWeekends.map((v) => [v.weekend, v])), [vrijeWeekends])

  // Huidige stand: per weekend de wedstrijden, en per ploeg per weekend hoeveel wedstrijden.
  const stand = useMemo(() => {
    const perWeekend = new Map<string, PlannerWedstrijd[]>()
    const ploegWeekend = new Map<string, number>()
    for (const w of wedstrijden) {
      const wk = weekendVan(wijz[w.id] ?? w.datum)
      perWeekend.set(wk, [...(perWeekend.get(wk) ?? []), w])
      for (const p of [w.thuis.id, w.uit.id]) ploegWeekend.set(`${p}|${wk}`, (ploegWeekend.get(`${p}|${wk}`) ?? 0) + 1)
    }
    return { perWeekend, ploegWeekend }
  }, [wedstrijden, wijz])

  const weekends = useMemo(() => {
    const alle = [...stand.perWeekend.keys()].sort()
    if (!alle.length) return []
    const uit: string[] = []
    for (let w = alle[0]; w <= shiftDateStr(alle[alle.length - 1], 21) && uit.length < 80; w = shiftDateStr(w, 7)) uit.push(w)
    return uit
  }, [stand])

  const problemenVan = (w: PlannerWedstrijd): { t: string; hard: boolean }[] => {
    const wk = weekendVan(datumVan(w))
    const uit: { t: string; hard: boolean }[] = []
    for (const p of [w.thuis, w.uit]) if ((stand.ploegWeekend.get(`${p.id}|${wk}`) ?? 0) > 1) uit.push({ t: `${p.naam} speelt 2× dit weekend`, hard: true })
    const o = onbMap.get(`${w.thuis.club}|${wk}`)
    if (o) uit.push({ t: `terrein ${w.thuis.clubNaam} niet vrij${o.reden ? ` (${o.reden})` : ''}`, hard: o.hard })
    const v = vrijMap.get(wk)
    if (v) uit.push({ t: `weekend zonder competitie${v.reden ? ` (${v.reden})` : ''}`, hard: true })
    return uit
  }

  /** De wedstrijden die samen verplaatsen met deze (koppel: zelfde clubs, zelfde weekend). */
  const groepVan = (id: number): PlannerWedstrijd[] => {
    const w = wedstrijden.find((x) => x.id === id)
    if (!w) return []
    if (!samen) return [w]
    const wk = weekendVan(datumVan(w))
    return wedstrijden.filter((x) => weekendVan(datumVan(x)) === wk && x.thuis.club === w.thuis.club && x.uit.club === w.uit.club)
  }

  /** Kan de groep naar dit weekend? null = ja; anders de reden (hard) of een waarschuwing (zacht). */
  const doelCheck = (wk: string): { kan: boolean; reden: string | null } => {
    if (gekozen == null) return { kan: true, reden: null }
    const groep = groepVan(gekozen)
    const ids = new Set(groep.map((g) => g.id))
    if (groep.some((g) => weekendVan(datumVan(g)) === wk)) return { kan: true, reden: null }
    for (const g of groep) {
      for (const p of [g.thuis, g.uit]) {
        const ander = (stand.perWeekend.get(wk) ?? []).find((x) => !ids.has(x.id) && (x.thuis.id === p.id || x.uit.id === p.id))
        if (ander) return { kan: false, reden: `${p.naam} speelt dan al` }
      }
      const o = onbMap.get(`${g.thuis.club}|${wk}`)
      if (o?.hard) return { kan: false, reden: `terrein ${g.thuis.clubNaam} niet vrij${o.reden ? ` (${o.reden})` : ''}` }
    }
    const v = vrijMap.get(wk)
    if (v) return { kan: false, reden: `geen competitie${v.reden ? ` (${v.reden})` : ''}` }
    const zacht = groep.map((g) => onbMap.get(`${g.thuis.club}|${wk}`)).find((o) => o && !o.hard)
    return { kan: true, reden: zacht ? `liever niet: ${zacht.reden ?? 'terrein'}` : null }
  }

  const verplaats = (wk: string) => {
    if (gekozen == null) return
    const check = doelCheck(wk)
    if (!check.kan) return toast('error', `Kan niet: ${check.reden}`)
    const groep = groepVan(gekozen)
    const nieuw = { ...wijz }
    for (const g of groep) {
      const huidig = datumVan(g)
      const d = dagenTussen(weekendVan(huidig), wk)
      // Zelfde dag in het weekend en zelfde Belgische wandklok (ook over zomer-/wintertijd heen).
      const p = brusselsParts(new Date(huidig))
      const [y, m, dd] = shiftDateStr(dateStrBE(new Date(huidig)), d).split('-').map(Number)
      const iso = brusselsWallUtc(y, m, dd, p.hour, p.minute).toISOString()
      if (iso === g.datum) delete nieuw[g.id]
      else nieuw[g.id] = iso
    }
    setGeschiedenis([...geschiedenis, wijz])
    setWijz(nieuw)
    setGekozen(null)
  }

  const zichtbaar = (w: PlannerWedstrijd) => (!reeks || w.reeks === reeks) && (!club || String(w.thuis.club) === club || String(w.uit.club) === club)
  const gewijzigd = wedstrijden.filter((w) => wijz[w.id])
  const alleProblemen = wedstrijden.filter((w) => problemenVan(w).some((p) => p.hard))

  const opslaan = async () => {
    setBezig(true)
    try {
      const res = await fetch('/api/federatie/verplaatsen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wijzigingen: gewijzigd.map((w) => ({ matchId: w.id, date: wijz[w.id] })) }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string; verplaatst?: number; overgeslagen?: { reden: string }[] }
      if (!res.ok) return toast('error', j.error ?? 'Opslaan mislukt.')
      toast('success', `${j.verplaatst ?? 0} verplaatst — iedereen is verwittigd.${j.overgeslagen?.length ? ` ${j.overgeslagen.length} overgeslagen.` : ''}`)
      setWijz({})
      setGeschiedenis([])
      router.refresh()
    } catch {
      toast('error', 'Geen verbinding — je wijzigingen staan nog klaar.')
    } finally {
      setBezig(false)
    }
  }

  const aanvraag = async (id: number, matchId: number, actie: 'goedkeuren' | 'afwijzen') => {
    const res = await fetch(`/api/match/${matchId}/verplaatsing`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actie, id }) })
    const j = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) return toast('error', j.error ?? 'Mislukt.')
    toast('success', actie === 'goedkeuren' ? 'Goedgekeurd — iedereen is verwittigd.' : 'Afgewezen.')
    router.refresh()
  }

  // Bulk: alle aanvragen waar beide clubs akkoord gaan in één keer goedkeuren (of de gekozen afwijzen).
  const [aanvraagKeuze, setAanvraagKeuze] = useState<Set<number>>(new Set())
  const [bulkBezig, setBulkBezig] = useState(false)
  const bulkAanvragen = async (lijst: VerplaatsingRij[], actie: 'goedkeuren' | 'afwijzen') => {
    if (!lijst.length || !window.confirm(`${actie === 'goedkeuren' ? 'Goedkeuren' : 'Afwijzen'}: ${lijst.length} ${lijst.length === 1 ? 'aanvraag' : 'aanvragen'}?`)) return
    setBulkBezig(true)
    let gelukt = 0
    const fouten: string[] = []
    for (const a of lijst) {
      const res = await fetch(`/api/match/${a.matchId}/verplaatsing`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actie, id: a.id }) }).catch(() => null)
      if (res?.ok) gelukt++
      else fouten.push(`${a.titel}: ${((await res?.json().catch(() => ({}))) as { error?: string } | undefined)?.error ?? 'mislukt'}`)
    }
    setBulkBezig(false)
    setAanvraagKeuze(new Set())
    toast(fouten.length ? 'info' : 'success', `${gelukt} ${actie === 'goedkeuren' ? 'goedgekeurd' : 'afgewezen'} — iedereen is verwittigd.${fouten.length ? ` Niet gelukt: ${fouten.join('; ')}` : ''}`)
    router.refresh()
  }
  const akkoordBeide = aanvragen.filter((a) => a.status === 'wacht_federatie')
  const gekozenAanvragen = aanvragen.filter((a) => aanvraagKeuze.has(a.id))

  const gekozenGroep = gekozen != null ? groepVan(gekozen) : []

  return (
    <div className="pl">
      <div className="pl-balk">
        <select value={reeks} onChange={(e) => setReeks(e.target.value)} aria-label="Reeks">
          <option value="">Alle reeksen</option>
          {reeksen.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select value={club} onChange={(e) => setClub(e.target.value)} aria-label="Club">
          <option value="">Alle clubs</option>
          {clubs.map(([id, n]) => (
            <option key={id} value={id}>
              {n}
            </option>
          ))}
        </select>
        <label className="pl-samen">
          <input type="checkbox" checked={samen} onChange={(e) => setSamen(e.target.checked)} /> Gekoppelde wedstrijden samen verplaatsen
        </label>
        <span className="pl-stat">
          {alleProblemen.length ? <span className="pl-rood">⛔ {alleProblemen.length} botsing(en)</span> : '✅ geen botsingen'} · {gewijzigd.length} wijziging(en)
        </span>
        <button type="button" className="ft-btn" disabled={!geschiedenis.length} onClick={() => {
          setWijz(geschiedenis[geschiedenis.length - 1])
          setGeschiedenis(geschiedenis.slice(0, -1))
        }}>
          ↶ Ongedaan
        </button>
        <button type="button" className="ft-btn ft-primair" disabled={!gewijzigd.length || bezig} onClick={() => void opslaan()}>
          {bezig ? 'Bezig…' : `Opslaan en iedereen verwittigen (${gewijzigd.length})`}
        </button>
      </div>

      {gekozen != null && (
        <p className="pl-hint" role="status">
          {gekozenGroep.length > 1 ? `${gekozenGroep.length} gekoppelde wedstrijden` : 'Wedstrijd'} gekozen — tik een weekend om te verplaatsen, of{' '}
          <button type="button" className="pl-link" onClick={() => setGekozen(null)}>
            annuleer
          </button>
          .
        </p>
      )}

      <div className="pl-bord">
        {weekends.map((wk) => {
          const lijst = (stand.perWeekend.get(wk) ?? []).filter(zichtbaar).sort((a, b) => datumVan(a).localeCompare(datumVan(b)) || a.thuis.clubNaam.localeCompare(b.thuis.clubNaam))
          const check = doelCheck(wk)
          const vrij = vrijMap.get(wk)
          return (
            <section
              key={wk}
              className={`pl-kolom ${gekozen != null ? (check.kan ? 'pl-kan' : 'pl-niet') : ''}`}
              onDragOver={(e) => {
                if (check.kan) e.preventDefault()
              }}
              onDrop={(e) => {
                e.preventDefault()
                verplaats(wk)
              }}
              onClick={() => gekozen != null && verplaats(wk)}
              title={check.reden ?? undefined}
            >
              <header className="pl-kop">
                <strong>{formatDateBE(wk, { weekday: 'short', day: 'numeric', month: 'short' })}</strong>
                <span>{lijst.length}</span>
              </header>
              {vrij && <p className="pl-vrij">Geen competitie{vrij.reden ? `: ${vrij.reden}` : ''}</p>}
              {gekozen != null && check.reden && !vrij && <p className={check.kan ? 'pl-zacht' : 'pl-reden'}>{check.reden}</p>}
              {lijst.map((w) => {
                const probs = problemenVan(w)
                const koppel = (stand.perWeekend.get(wk) ?? []).filter((x) => x.thuis.club === w.thuis.club && x.uit.club === w.uit.club).length > 1
                return (
                  <button
                    type="button"
                    key={w.id}
                    draggable
                    onDragStart={() => setGekozen(w.id)}
                    onClick={(e) => {
                      e.stopPropagation()
                      setGekozen(gekozen === w.id ? null : w.id)
                    }}
                    className={`pl-kaart ${gekozenGroep.some((g) => g.id === w.id) ? 'pl-gekozen' : ''} ${probs.some((p) => p.hard) ? 'pl-botst' : probs.length ? 'pl-let' : ''} ${wijz[w.id] ? 'pl-nieuw' : ''}`}
                  >
                    <span className="pl-r1">
                      {formatDateBE(datumVan(w), { weekday: 'short' })} {formatTimeBE(datumVan(w))} · {w.reeks} {koppel ? '🔗' : ''} {w.afgelast ? '⛈️' : ''}
                    </span>
                    <span className="pl-r2">
                      {w.thuis.naam} – {w.uit.naam}
                    </span>
                    {probs.map((p) => (
                      <span key={p.t} className={p.hard ? 'pl-rood' : 'pl-oranje'}>
                        {p.hard ? '⛔' : '⚠️'} {p.t}
                      </span>
                    ))}
                    {wijz[w.id] && <span className="pl-oranje">was {formatDateTimeBE(w.datum)}</span>}
                  </button>
                )
              })}
            </section>
          )
        })}
      </div>

      <h2 style={{ margin: '20px 0 8px', fontSize: '1.05rem' }}>🔁 Verplaatsingsaanvragen van clubs</h2>
      {aanvragen.length === 0 ? (
        <p className="empty">Geen openstaande aanvragen.</p>
      ) : (
        <div className="ft-lijst">
          <div className="bt-bulk" style={{ position: 'static' }}>
            {akkoordBeide.length > 0 && (
              <button type="button" className="ft-btn ft-primair" disabled={bulkBezig} onClick={() => void bulkAanvragen(akkoordBeide, 'goedkeuren')}>
                ✅ Alle {akkoordBeide.length} goedkeuren waar beide clubs akkoord zijn
              </button>
            )}
            {gekozenAanvragen.length > 0 && (
              <>
                <strong>{gekozenAanvragen.length} gekozen</strong>
                <button type="button" className="ft-btn ft-primair" disabled={bulkBezig} onClick={() => void bulkAanvragen(gekozenAanvragen, 'goedkeuren')}>Goedkeuren ({gekozenAanvragen.length})</button>
                <button type="button" className="ft-btn" disabled={bulkBezig} onClick={() => void bulkAanvragen(gekozenAanvragen, 'afwijzen')}>Afwijzen ({gekozenAanvragen.length})</button>
              </>
            )}
            {akkoordBeide.length === 0 && gekozenAanvragen.length === 0 && <span className="ft-stat">Vink aanvragen aan om ze samen te behandelen.</span>}
          </div>
          {aanvragen.map((a) => (
            <div key={a.id} className={`ft-kaart${aanvraagKeuze.has(a.id) ? ' bt-gekozen' : ''}`}>
              <label className="bt-alles">
                <input
                  type="checkbox"
                  className="bt-vink"
                  checked={aanvraagKeuze.has(a.id)}
                  onChange={() =>
                    setAanvraagKeuze((s) => {
                      const n = new Set(s)
                      if (n.has(a.id)) n.delete(a.id)
                      else n.add(a.id)
                      return n
                    })
                  }
                />
                Kiezen
              </label>
              <strong>
                <Link href={`/match/${a.matchId}`}>{a.titel}</Link>
              </strong>
              <span className="ft-stat">
                {a.oorspronkelijk ? formatDateTimeBE(a.oorspronkelijk) : '—'} → <strong>{formatDateTimeBE(a.voorgesteld)}</strong> ·{' '}
                {a.status === 'wacht_federatie' ? 'beide clubs akkoord' : 'tegenpartij heeft nog niet geantwoord'}
              </span>
              <span className="ft-stat">Reden: {a.reden}</span>
              <div className="ft-balk" style={{ position: 'static', padding: 0 }}>
                <button type="button" className="ft-btn ft-primair" onClick={() => void aanvraag(a.id, a.matchId, 'goedkeuren')}>
                  ✅ Goedkeuren
                </button>
                <button type="button" className="ft-btn" onClick={() => void aanvraag(a.id, a.matchId, 'afwijzen')}>
                  Afwijzen
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
