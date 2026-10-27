'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { toast } from '@/components/Toaster'
import { dateStrBE, formatDateBE, formatDateTimeBE, shiftDateStr, zaterdagVan } from '@/lib/datetime'
import { weekLabel, weekendVerplaatsing } from '@/lib/weekend-verplaatsen'

export type Speelweekend = {
  /** De zaterdag, "YYYY-MM-DD". */
  zaterdag: string
  /** Bv. "week 43 · 24 okt – 25 okt 2026". */
  label: string
  wedstrijden: { matchId: number; titel: string; reeks: string; datumIso: string; tijd: string; afgelast: boolean }[]
}

const kort: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }

export function WeekendVerplaatsen({ weekends, standaard }: { weekends: Speelweekend[]; standaard: string }) {
  const router = useRouter()
  const [van, setVan] = useState(standaard)
  const [naarInvoer, setNaarInvoer] = useState('')
  const [bezig, setBezig] = useState(false)

  const bron = weekends.find((w) => w.zaterdag === van) ?? null
  // Welke dag je ook kiest, het wordt het weekend waarin die dag valt.
  const naar = /^\d{4}-\d{2}-\d{2}$/.test(naarInvoer) ? zaterdagVan(naarInvoer) : ''
  const voorbeeld = useMemo(() => (bron && naar && naar !== van ? weekendVerplaatsing(bron.wedstrijden.map((w) => ({ matchId: w.matchId, date: w.datumIso })), van, naar) : null), [bron, van, naar])
  const doel = naar ? (weekends.find((w) => w.zaterdag === naar) ?? null) : null
  const botsingen = useMemo(() => {
    if (!voorbeeld || !doel || !bron) return []
    // Een ploeg die in het nieuwe weekend al speelt, krijgt twee wedstrijden op één weekend.
    const ploegen = new Set(doel.wedstrijden.flatMap((w) => w.titel.split(' – ')))
    return bron.wedstrijden.filter((w) => w.titel.split(' – ').some((p) => ploegen.has(p)))
  }, [voorbeeld, doel, bron])
  const verleden = naar !== '' && naar < zaterdagVan(dateStrBE())

  const bewaar = async () => {
    if (!bron || !naar) return
    const vraag = `${bron.wedstrijden.length} wedstrijden van ${weekLabel(van)} verplaatsen naar ${weekLabel(naar)} (${formatDateBE(`${naar}T12:00:00Z`)})? Iedereen krijgt een melding.`
    if (!window.confirm(vraag)) return
    setBezig(true)
    try {
      const res = await fetch('/api/federatie/weekend-verplaatsen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ van, naar }),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string; verplaatst?: number; overgeslagen?: { reden: string }[] }
      if (!res.ok) {
        toast('error', d.error ?? 'Verplaatsen mislukt.')
        return
      }
      const over = d.overgeslagen?.length ?? 0
      toast(over ? 'info' : 'success', `${d.verplaatst ?? 0} wedstrijden verplaatst naar ${weekLabel(naar)}; iedereen kreeg een melding.${over ? ` ${over} niet (al bezig of gespeeld).` : ''}`)
      setNaarInvoer('')
      setVan(naar)
      router.refresh()
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className="ft-wrap">
      <div className="ft-velden">
        <label className="ft-veld">
          Weekend dat verplaatst wordt
          <select value={van} onChange={(e) => setVan(e.target.value)} aria-label="Weekend dat verplaatst wordt">
            {weekends.map((w) => (
              <option key={w.zaterdag} value={w.zaterdag}>
                {w.label} · {w.wedstrijden.length} {w.wedstrijden.length === 1 ? 'wedstrijd' : 'wedstrijden'}
              </option>
            ))}
          </select>
        </label>
        <label className="ft-veld">
          Nieuw weekend (kies een dag; het hele weekend telt)
          <input type="date" value={naarInvoer} onChange={(e) => setNaarInvoer(e.target.value)} aria-label="Nieuw weekend" />
        </label>
      </div>
      {naar && naar === van && <p className="ft-fout">Dat is hetzelfde weekend.</p>}
      {verleden && <p className="ft-fout">Dat weekend is al voorbij.</p>}
      {voorbeeld && bron && (
        <div className="ft-kaart">
          <h2>
            {weekLabel(van)} → {weekLabel(naar)} · {formatDateBE(`${naar}T12:00:00Z`, { day: 'numeric', month: 'long' })} – {formatDateBE(`${shiftDateStr(naar, 1)}T12:00:00Z`, { day: 'numeric', month: 'long', year: 'numeric' })}
          </h2>
          <p className="ft-stat">
            {voorbeeld.wijzigingen.length} wedstrijden schuiven {Math.abs(voorbeeld.dagen)} dagen {voorbeeld.dagen > 0 ? 'vooruit' : 'terug'}.
            {doel ? ` In dat weekend staan al ${doel.wedstrijden.length} wedstrijden.` : ' Dat weekend is nog vrij.'}
          </p>
          {botsingen.length > 0 && (
            <p className="ft-fout">
              {botsingen.length} {botsingen.length === 1 ? 'ploeg speelt' : 'ploegen spelen'} dat weekend al: {botsingen.map((b) => b.titel).join(', ')}.
            </p>
          )}
          <div className="ft-lijst">
            {bron.wedstrijden.map((w) => {
              const nieuw = voorbeeld.wijzigingen.find((x) => x.matchId === w.matchId)
              const botst = botsingen.some((b) => b.matchId === w.matchId)
              return (
                <div key={w.matchId} className={`ft-rij ${botst ? 'ft-conflict' : 'ft-gewijzigd'}`}>
                  <div className="ft-wedstrijd">
                    <strong>
                      {w.titel}
                      {w.afgelast ? ' · ⛈️ afgelast' : ''}
                    </strong>
                    <small>
                      {w.tijd} → <b>{nieuw ? formatDateTimeBE(nieuw.date, kort) : '–'}</b>
                      {w.reeks ? ` · ${w.reeks}` : ''}
                    </small>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="ft-balk" style={{ position: 'static' }}>
            <button type="button" className="ft-btn ft-primair" disabled={bezig || verleden || voorbeeld.wijzigingen.length === 0} onClick={bewaar}>
              {bezig ? 'Bezig…' : `Heel weekend verplaatsen (${voorbeeld.wijzigingen.length})`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
