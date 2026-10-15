'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import type { KioskWedstrijd } from '@/lib/virtueel-kiosk'

// De wedkiosk in het wedkantoor: een échte pronostiek plaatsen, vanuit het stadion. Kies een
// wedstrijd, tik je uitslag in, zet er eventueel een booster van het bonusrad op, en de kiosk
// print je wedticket. Het gaat langs dezelfde API als de matchpagina (POST /api/club/predict),
// dus het telt mee in het klassement van /pronostiek, met dezelfde regels.

type Wedstrijd = KioskWedstrijd & { over: number | null; week: string }
type Data = { ingelogd: boolean; max: number; boosters: number[]; wedstrijden: Wedstrijd[] }

const fmtMult = (v: number) => `×${Number.isInteger(v) ? v : String(v).replace('.', ',')}`
const wanneer = (iso: string) =>
  new Date(iso).toLocaleString('nl-BE', { timeZone: 'Europe/Brussels', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function Teller({ naam, waarde, zet }: { naam: string; waarde: number; zet: (n: number) => void }) {
  return (
    <div className="vk-kiosk-teller">
      <span>{naam}</span>
      <div>
        <button type="button" onClick={() => zet(Math.max(0, waarde - 1))} disabled={waarde <= 0} aria-label={`Eén minder voor ${naam}`}>
          −
        </button>
        <b>{waarde}</b>
        <button type="button" onClick={() => zet(Math.min(199, waarde + 1))} aria-label={`Eén meer voor ${naam}`}>
          +
        </button>
      </div>
      <div className="vk-kiosk-snel">
        {[-5, 5].map((d) => (
          <button key={d} type="button" onClick={() => zet(Math.min(199, Math.max(0, waarde + d)))}>
            {d > 0 ? `+${d}` : d}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Wedkiosk({ open, onSluit, clubId, onGezet }: { open: boolean; onSluit: () => void; clubId: number | null; onGezet: (w: Wedstrijd, h: number, a: number) => void }) {
  const [data, setData] = useState<Data | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const [keuze, setKeuze] = useState<Wedstrijd | null>(null)
  const [thuis, setThuis] = useState(0)
  const [uit, setUit] = useState(0)
  const [boost, setBoost] = useState<number | null>(null)
  const [bezig, setBezig] = useState(false)
  const [ticket, setTicket] = useState<{ w: Wedstrijd; h: number; a: number; mult: number } | null>(null)

  useEffect(() => {
    if (!open) {
      setKeuze(null)
      setTicket(null)
      setFout(null)
      return
    }
    let weg = false
    fetch(`/api/virtueel/kiosk?club=${clubId ?? ''}`, { cache: 'no-store', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: Data) => !weg && setData(d))
      .catch(() => !weg && setFout('De kiosk krijgt geen verbinding. Probeer zo meteen opnieuw.'))
    return () => {
      weg = true
    }
  }, [open, clubId])

  const kies = (w: Wedstrijd) => {
    setKeuze(w)
    setThuis(0)
    setUit(0)
    setBoost(null)
    setFout(null)
  }

  const zet = async () => {
    if (!keuze) return
    setBezig(true)
    setFout(null)
    try {
      const r = await fetch('/api/club/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ matchId: keuze.id, home: thuis, away: uit, boosterMult: boost ?? undefined }),
      })
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; boosterUsed?: number }
      if (!r.ok || !j.ok) throw new Error(j.error || 'Je pronostiek kon niet doorgaan.')
      const mult = Number(j.boosterUsed) || 1
      setTicket({ w: keuze, h: thuis, a: uit, mult })
      onGezet(keuze, thuis, uit)
      // De lijst bijwerken: deze wedstrijd staat nu vast, en je hebt er één minder over die week.
      setData((d) => {
        if (!d) return d
        const boosters = [...d.boosters]
        if (mult > 1) boosters.splice(boosters.indexOf(mult), 1)
        return {
          ...d,
          boosters,
          wedstrijden: d.wedstrijden.map((w) =>
            w.id === keuze.id ? { ...w, mijn: { home: thuis, away: uit }, over: w.over != null ? w.over - 1 : null } : w.over != null && w.week === keuze.week ? { ...w, over: w.over - 1 } : w,
          ),
        }
      })
      setKeuze(null)
    } catch (e) {
      setFout((e as Error).message)
    } finally {
      setBezig(false)
    }
  }

  if (!open) return null
  const boosterKeuzes = data ? [...new Set(data.boosters)].sort((a, b) => b - a) : []
  return (
    <div className="vk-spel vk-kiosk" role="dialog" aria-label="Wedkiosk: plaats je pronostiek">
      <div className="vk-graf-kop">
        <div>
          <b>🎟️ Wedkiosk · voorspel mee</b>
          <span>Telt mee in de echte pronostiek van Krachtbal Live</span>
        </div>
        <button className="vk-graf-sluit" onClick={onSluit} aria-label="Sluiten">
          ✕
        </button>
      </div>
      <div className="vk-kiosk-inhoud">
        {ticket ? (
          <div className="vk-kiosk-ticketvak">
            <div className="vk-kiosk-ticket">
              <span className="kop">WEDTICKET · KRACHTBAL LIVE</span>
              <span className="wedstrijd">{ticket.w.thuis}</span>
              <b>
                {ticket.h} – {ticket.a}
              </b>
              <span className="wedstrijd">{ticket.w.uit}</span>
              <span className="klein">{wanneer(ticket.w.datum)} · {ticket.w.reeks}</span>
              {ticket.mult > 1 && <span className="boost">🎰 booster {fmtMult(ticket.mult)}</span>}
              <span className="streep" aria-hidden />
              <span className="klein">Enkel jij ziet je tip · veel geluk!</span>
            </div>
            <div className="vk-kiosk-acties">
              <button className="vk-graf-plaats" onClick={() => setTicket(null)}>
                Nog een wedstrijd
              </button>
              <Link className="vk-booth-opnieuw vk-kiosk-link" href="/pronostiek">
                Klassement →
              </Link>
            </div>
          </div>
        ) : keuze ? (
          <div className="vk-kiosk-invoer">
            <button className="vk-kiosk-terug" onClick={() => setKeuze(null)}>
              ← Wedstrijden
            </button>
            <p className="vk-kiosk-wanneer">
              {wanneer(keuze.datum)} · {keuze.reeks}
            </p>
            <div className="vk-kiosk-tellers">
              <Teller naam={keuze.thuis} waarde={thuis} zet={setThuis} />
              <span className="vk-kiosk-tegen">–</span>
              <Teller naam={keuze.uit} waarde={uit} zet={setUit} />
            </div>
            {boosterKeuzes.length > 0 && (
              <div className="vk-kiosk-boosters">
                <span>Booster van het bonusrad:</span>
                <button className={boost == null ? 'aan' : ''} onClick={() => setBoost(null)}>
                  geen
                </button>
                {boosterKeuzes.map((b) => (
                  <button key={b} className={boost === b ? 'aan' : ''} onClick={() => setBoost(b)}>
                    🎰 {fmtMult(b)}
                  </button>
                ))}
              </div>
            )}
            {fout && <p className="vk-graf-fout">{fout}</p>}
            <button className="vk-graf-plaats vk-kiosk-zet" disabled={bezig} onClick={() => void zet()}>
              {bezig ? 'Ticket printen…' : `🎟️ Zet ${thuis}–${uit}`}
            </button>
            <p className="vk-graf-tip">Eens gezet staat je pronostiek vast. Voorspellen kan tot de aftrap.</p>
          </div>
        ) : !data ? (
          <p className="vk-spel-uitleg">{fout ?? 'De kiosk start op…'}</p>
        ) : (
          <>
            {!data.ingelogd && (
              <p className="vk-kiosk-melding">
                Kijk gerust rond. Om een pronostiek te zetten moet je <Link href="/inloggen">inloggen</Link>.
              </p>
            )}
            {data.wedstrijden.length === 0 ? (
              <p className="vk-spel-uitleg">Er staan de komende twee weken geen wedstrijden op het programma.</p>
            ) : (
              <ul className="vk-kiosk-lijst">
                {data.wedstrijden.map((w) => {
                  const kan = data.ingelogd && w.open && !w.mijn && (w.over ?? 1) > 0
                  return (
                    <li key={w.id}>
                      <button className={`vk-kiosk-rij${w.eigenClub ? ' eigen' : ''}`} disabled={!kan} onClick={() => kies(w)}>
                        <span className="wie">
                          <b>{w.thuis}</b>
                          <b>{w.uit}</b>
                        </span>
                        <span className="wat">
                          <span>{wanneer(w.datum)}</span>
                          <span className="reeks">{w.reeks}</span>
                        </span>
                        <span className="status">
                          {w.mijn ? (
                            <em className="gezet">
                              ✓ {w.mijn.home}–{w.mijn.away}
                            </em>
                          ) : !w.open ? (
                            <em>opent maandag</em>
                          ) : data.ingelogd && (w.over ?? 1) <= 0 ? (
                            <em>week vol</em>
                          ) : (
                            <em className="zet">Voorspel ›</em>
                          )}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            {data.ingelogd && (
              <p className="vk-graf-tip">
                Je mag {data.max} wedstrijden per speelweek voorspellen.
                {data.boosters.length > 0 && ` Je hebt ${data.boosters.length} booster${data.boosters.length > 1 ? 's' : ''} van het bonusrad klaar.`}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
