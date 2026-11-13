'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { formatDateTimeBE } from '@/lib/datetime'

export type RefMatch = {
  id: number
  home: string
  away: string
  homeClub: string | null
  awayClub: string | null
  reeks: string
  date: string | null
  status: string
  assignedRefId: number | null
  assignedRefName: string | null
  /** Status van het wedstrijdblad (concept, vrijgegeven, ingediend…), voor "wat moet nog". */
  bladStatus?: string | null
}

export type RefOfficial = { id: number; name: string }

// Wedstrijdenlijst in het scheidsrechtersportaal: alle wedstrijden, met de mogelijkheid om een
// vrije wedstrijd zelf op te nemen of de eigen wedstrijd door te geven aan een andere SR.
export function RefereeMatches({
  matches,
  officials,
  myOfficialId,
  isFederation,
  modus,
}: {
  matches: RefMatch[]
  officials: RefOfficial[]
  myOfficialId: number | null
  isFederation: boolean
  /** Vast filter per tabblad van het portaal: mijn wedstrijden, vrije wedstrijden, of alles (met filterknoppen). */
  modus?: 'mijn' | 'vrij' | 'alle'
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<number | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [handoff, setHandoff] = useState<number | null>(null) // matchId waarvoor de doorgeef-keuze open staat
  const [filterKeuze, setFilter] = useState<'all' | 'mine' | 'free'>('all')
  const filter = modus === 'mijn' ? 'mine' : modus === 'vrij' ? 'free' : filterKeuze
  const [reeksFilter, setReeksFilter] = useState('')
  const [clubFilter, setClubFilter] = useState('')

  // Keuzelijsten met tellingen over de volledige lijst — stabiel, ongeacht de andere filters.
  const reeksOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of matches) counts.set(m.reeks, (counts.get(m.reeks) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'nl'))
  }, [matches])

  const clubOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of matches)
      for (const c of new Set([m.homeClub, m.awayClub])) if (c) counts.set(c, (counts.get(c) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'nl'))
  }, [matches])

  const shown = useMemo(() => {
    return matches.filter((m) => {
      if (filter === 'mine' && !(myOfficialId != null && m.assignedRefId === myOfficialId)) return false
      if (filter === 'free' && m.assignedRefId != null) return false
      if (reeksFilter && m.reeks !== reeksFilter) return false
      // Club-filter: de club speelt thuis óf op verplaatsing.
      if (clubFilter && m.homeClub !== clubFilter && m.awayClub !== clubFilter) return false
      return true
    })
  }, [matches, filter, myOfficialId, reeksFilter, clubFilter])

  const act = async (matchId: number, action: string, targetOfficialId?: number) => {
    setBusy(matchId)
    setMsg(null)
    try {
      const res = await fetch(`/api/scheidsrechter/wedstrijd/${matchId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, targetOfficialId }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'Mislukt')
      setHandoff(null)
      router.refresh()
    } catch (err) {
      setMsg((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const fmtDate = (d: string | null) =>
    d ? formatDateTimeBE(new Date(d), { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
  const statusLabel = (s: string) => (s === 'live' ? 'LIVE' : s === 'finished' ? 'Afgelopen' : 'Gepland')

  // "Mijn wedstrijden": wat nu moet bovenaan, de rest per moment; later ingeklapt.
  const groepen: { titel: string; lijst: RefMatch[]; ingeklapt?: boolean }[] =
    modus === 'mijn'
      ? (() => {
          const afwerken = shown.filter((m) => m.status === 'finished' && m.bladStatus !== 'ingediend')
          const live = shown.filter((m) => m.status === 'live')
          const komend = shown.filter((m) => m.status === 'scheduled')
          return [
            { titel: '✍️ Af te werken', lijst: afwerken },
            { titel: '● Nu bezig', lijst: live },
            { titel: 'Komend', lijst: komend.slice(0, 4) },
            { titel: `Later (${Math.max(0, komend.length - 4)})`, lijst: komend.slice(4), ingeklapt: true },
          ].filter((g) => g.lijst.length > 0)
        })()
      : [{ titel: '', lijst: shown }]

  const rij = (m: RefMatch) => {
            const mine = myOfficialId != null && m.assignedRefId === myOfficialId
            const free = m.assignedRefId == null
            const canHandoff = isFederation || mine
            return (
              <li key={m.id} className={`rm-row ${m.status}`}>
                <div className="rm-info">
                  <span className="rm-teams">{m.home} <span className="rm-vs">—</span> {m.away}</span>
                  <span className="rm-meta">{m.reeks} · {fmtDate(m.date)} · <span className={`rm-status ${m.status}`}>{statusLabel(m.status)}</span></span>
                  <span className={`rm-ref ${free ? 'free' : ''}`}>
                    {free ? '⚠️ Geen scheidsrechter' : `🟡 ${m.assignedRefName}${mine ? ' (jij)' : ''}`}
                  </span>
                  {mine && m.status === 'finished' && m.bladStatus !== 'ingediend' && <span className="rm-ref free">✍️ Blad nog af te tekenen en in te dienen</span>}
                </div>
                <div className="rm-actions">
                  {/* Je eigen wedstrijd: meteen naar het wedstrijdblad (voorbereiden, leiden, aftekenen). */}
                  {(mine || isFederation) && !free && (
                    <Link href={`/scheidsrechter/${m.id}`} className={`wb-btn rm-btn${mine ? ' wb-btn-primary' : ''}`}>
                      {m.status === 'finished' && m.bladStatus !== 'ingediend' ? 'Afwerken →' : 'Open wedstrijdblad →'}
                    </Link>
                  )}
                  {/* Vrije wedstrijd: een SR neemt ze zelf; de federatie wijst ze toe. */}
                  {free && myOfficialId != null && (
                    <button type="button" className="wb-btn wb-btn-primary rm-btn" disabled={busy === m.id} onClick={() => act(m.id, 'claim')}>
                      {busy === m.id ? '…' : 'Ik neem deze'}
                    </button>
                  )}
                  {/* Doorgeven (toegewezen wedstrijd) of toewijzen (federatie, vrije wedstrijd) via dezelfde keuze. */}
                  {((!free && canHandoff) || (free && isFederation)) && (
                    handoff === m.id ? (
                      <span className="rm-handoff">
                        <select
                          className="wb-input rm-select"
                          defaultValue=""
                          onChange={(e) => e.target.value && act(m.id, 'handoff', Number(e.target.value))}
                          aria-label={free ? 'Toewijzen aan' : 'Doorgeven aan'}
                        >
                          <option value="" disabled>Kies scheidsrechter…</option>
                          {officials.filter((o) => o.id !== m.assignedRefId).map((o) => (
                            <option key={o.id} value={o.id}>{o.name}</option>
                          ))}
                        </select>
                        <button type="button" className="wb-link-btn" onClick={() => setHandoff(null)}>annuleer</button>
                      </span>
                    ) : (
                      <button type="button" className="wb-btn rm-btn" disabled={busy === m.id} onClick={() => setHandoff(m.id)}>
                        {free ? 'Toewijzen' : 'Doorgeven'}
                      </button>
                    )
                  )}
                  {!free && canHandoff && (
                    <button type="button" className="wb-link-btn rm-release" title="Je bent niet langer de scheidsrechter van deze wedstrijd; ze wordt weer vrij." disabled={busy === m.id} onClick={() => act(m.id, 'release')}>
                      afstaan
                    </button>
                  )}
                </div>
              </li>
            )
  }

  return (
    <section className="wb-card rm">
      <div className="rm-head">
        <h2>{modus === 'mijn' ? 'Mijn wedstrijden' : modus === 'vrij' ? 'Vrije wedstrijden' : 'Wedstrijden'}</h2>
        {!modus || modus === 'alle' ? (
        <div className="rm-filters">
          {(['all', 'free', 'mine'] as const).map((f) => (
            <button key={f} type="button" className={`rm-filter ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? 'Alle' : f === 'free' ? 'Zonder SR' : 'Van mij'}
            </button>
          ))}
        </div>
        ) : null}
      </div>
      {modus !== 'mijn' && (reeksOptions.length > 1 || clubOptions.length > 1) && (
        <div className="rm-selects">
          <select
            className="wb-input rm-fsel"
            value={reeksFilter}
            onChange={(e) => setReeksFilter(e.target.value)}
            aria-label="Filter op reeks"
          >
            <option value="">Alle reeksen</option>
            {reeksOptions.map(([r, n]) => (
              <option key={r} value={r}>{r} ({n})</option>
            ))}
          </select>
          <select
            className="wb-input rm-fsel"
            value={clubFilter}
            onChange={(e) => setClubFilter(e.target.value)}
            aria-label="Filter op club"
          >
            <option value="">Alle clubs</option>
            {clubOptions.map(([c, n]) => (
              <option key={c} value={c}>{c} ({n})</option>
            ))}
          </select>
        </div>
      )}
      <p className="wb-sub">
        {modus === 'mijn'
          ? 'Open het wedstrijdblad om de wedstrijd voor te bereiden, te leiden en af te tekenen. Kan je niet? Geef de wedstrijd door.'
          : modus === 'vrij'
            ? 'Wedstrijden zonder scheidsrechter. Neem er zelf een op; de federatie ziet het meteen.'
            : 'Vrije wedstrijden kan je zelf opnemen. Een wedstrijd die je toegewezen kreeg, kan je doorgeven aan een andere scheidsrechter als je niet kan. De federatie kan altijd toewijzen.'}
      </p>
      {msg && <p className="wb-msg" style={{ color: '#e0533d' }}>{msg}</p>}

      {shown.length === 0 ? (
        <p className="wb-sub">{modus === 'mijn' ? 'Je hebt geen komende wedstrijden. Kijk bij "Vrije wedstrijden" om er een op te nemen.' : modus === 'vrij' ? 'Alle wedstrijden hebben een scheidsrechter. ✓' : 'Geen wedstrijden in deze selectie.'}</p>
      ) : (
        groepen.map((g) =>
          g.ingeklapt ? (
            <details key={g.titel} className="rm-later">
              <summary>{g.titel}</summary>
              <ul className="rm-list">{g.lijst.map(rij)}</ul>
            </details>
          ) : (
            <div key={g.titel || 'alle'}>
              {g.titel && <h3 className="rm-groep">{g.titel}</h3>}
              <ul className="rm-list">{g.lijst.map(rij)}</ul>
            </div>
          ),
        )
      )}
    </section>
  )
}
