'use client'

import { useEffect, useMemo, useState } from 'react'

import { fmtClock, useTicking } from '../../../useTournament'

// ── Het zelfaanpassende kantinescherm van een tornooidag ─────────────────────────────────────
// Eén link die je 's ochtends opent en de hele dag laat staan:
//  • niets bezig → groot aftellen naar de volgende geplande wedstrijd(en);
//  • één wedstrijd bezig → die staat schermvullend;
//  • meerdere bezig → het raster verdeelt zichzelf netjes (2, 3, 4 … naast/onder elkaar);
//  • wordt er één afgesloten, dan past het scherm zich vanzelf weer aan.
// Data komt uit de publieke groep-API (poll om de 8 s, zoals het club-kantinescherm).

type GMatch = {
  id: number
  tournamentId: number
  reeksNaam: string
  label: string
  home: string | null
  away: string | null
  status: 'pending' | 'live' | 'finished'
  score: { home: number; away: number }
  crosses: { home: number; away: number }
  timeouts: { home: number; away: number }
  currentHalf: number
  clockSeconds: number
  clockRunning: boolean
  plannedAt: string | null
}
type GroepData = { naam: string; reeksen: { id: number; naam: string; champion: string | null }[]; matches: GMatch[] }

const POLL_MS = 8000

// Rasterindeling naar aantal live borden — zelfde filosofie als het club-kantinescherm.
function kolommenVoor(n: number): number {
  if (n <= 1) return 1
  if (n <= 4) return 2
  if (n <= 9) return 3
  return 4
}

function LiveBord({ m, groot }: { m: GMatch; groot: boolean }) {
  const clock = useTicking(m.clockSeconds, m.clockRunning)
  return (
    <div className={`gk-bord${groot ? ' groot' : ''}`}>
      <div className="gk-bord-kop">
        <span className="gk-bord-reeks">{m.reeksNaam}{m.label ? ` · ${m.label}` : ''}</span>
        <span className="gk-bord-klok">H{m.currentHalf} · {fmtClock(clock)}</span>
      </div>
      <div className="gk-bord-body">
        <span className="gk-bord-team">{m.home ?? '—'}</span>
        <span className="gk-bord-score">{m.score.home} – {m.score.away}</span>
        <span className="gk-bord-team uit">{m.away ?? '—'}</span>
      </div>
      <div className="gk-bord-voet">
        <span title="Kruisjes">✖ {m.crosses.home}–{m.crosses.away}</span>
        <span title="Time-outs">⏱ {m.timeouts.home}–{m.timeouts.away}</span>
      </div>
    </div>
  )
}

// Aftellen naar een tijdstip; onder nul tonen we "zo meteen" (de aantekenaar is nog niet gestart).
// De klok start pas ná het mounten: op de server bestaat "nu" nog niet, en een servertijd zou een
// hydration-mismatch geven.
function Aftel({ naar }: { naar: number }) {
  const [nu, setNu] = useState<number | null>(null)
  useEffect(() => {
    setNu(Date.now())
    const t = setInterval(() => setNu(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  if (nu == null) return <span className="gk-aftel-tijd">–:––</span>
  const rest = Math.floor((naar - nu) / 1000)
  if (rest <= 0) return <span className="gk-aftel-nu">zo meteen</span>
  const u = Math.floor(rest / 3600)
  const m = Math.floor((rest % 3600) / 60)
  const s = rest % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return <span className="gk-aftel-tijd">{u > 0 ? `${u}:${p(m)}:${p(s)}` : `${m}:${p(s)}`}</span>
}

const tijdBE = (iso: string) =>
  new Date(iso).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels' })

export function GroepKantine({ naam, initial }: { naam: string; initial: GroepData }) {
  const [data, setData] = useState<GroepData>(initial)

  useEffect(() => {
    let actief = true
    const laad = async () => {
      try {
        const r = await fetch(`/api/tornooi-groep?naam=${encodeURIComponent(naam)}`, { cache: 'no-store' })
        if (!r.ok) return
        const d = (await r.json()) as GroepData
        if (actief) setData(d)
      } catch {
        /* netwerkfout — volgende poll probeert opnieuw */
      }
    }
    const t = setInterval(laad, POLL_MS)
    return () => {
      actief = false
      clearInterval(t)
    }
  }, [naam])

  const live = data.matches.filter((m) => m.status === 'live')
  // Komende wedstrijden: nog te spelen mét beide ploegen bekend, gesorteerd op gepland uur
  // (ongeplande achteraan). De eerstvolgende geplande voedt het aftellen.
  const komend = useMemo(() => {
    const pending = data.matches.filter((m) => m.status === 'pending' && m.home && m.away)
    return pending.sort((a, b) => {
      const ta = a.plannedAt ? new Date(a.plannedAt).getTime() : Infinity
      const tb = b.plannedAt ? new Date(b.plannedAt).getTime() : Infinity
      return ta - tb
    })
  }, [data.matches])
  const eerstGepland = komend.find((m) => m.plannedAt)

  const cols = kolommenVoor(live.length)
  const kampioenen = data.reeksen.filter((r) => r.champion)

  return (
    <div className="gk-scherm">
      <header className="gk-kop">
        <span className="gk-titel"><span className="brand">Krachtbal</span> · {data.naam}</span>
        <span className="gk-kop-status">
          {live.length > 0 ? `● ${live.length} bezig` : komend.length > 0 ? `${komend.length} nog te spelen` : 'dag afgerond'}
        </span>
      </header>

      {live.length > 0 ? (
        <div className="gk-raster" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {live.map((m) => (
            <LiveBord key={m.id} m={m} groot={live.length === 1} />
          ))}
        </div>
      ) : komend.length > 0 ? (
        <div className="gk-pauze">
          {eerstGepland?.plannedAt ? (
            <>
              <p className="gk-aftel-lbl">Volgende wedstrijd over</p>
              <Aftel naar={new Date(eerstGepland.plannedAt).getTime()} />
            </>
          ) : (
            <p className="gk-aftel-lbl">Volgende wedstrijden</p>
          )}
          <ul className="gk-komend">
            {komend.slice(0, 6).map((m) => (
              <li key={m.id} className="gk-komend-rij">
                <span className="gk-komend-uur">{m.plannedAt ? tijdBE(m.plannedAt) : '—'}</span>
                <span className="gk-komend-affiche">{m.home} – {m.away}</span>
                <span className="gk-komend-reeks">{m.reeksNaam}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="gk-pauze">
          <p className="gk-aftel-lbl">🏆 Alle wedstrijden zijn gespeeld</p>
          {kampioenen.length > 0 && (
            <ul className="gk-kampioenen">
              {kampioenen.map((r) => (
                <li key={r.id}><b>{r.naam}</b>: {r.champion}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
