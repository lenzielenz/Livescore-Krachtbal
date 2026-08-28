'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import { FieldSchema } from '@/components/FieldSchema'
import { TeamLogo } from '@/components/TeamLogo'
import type { GroepData, GroepMatch } from '@/lib/tornooi-groep'
import { fmtClock, useTicking } from '../../../useTournament'

// ── Dagprogramma van een tornooidag ──────────────────────────────────────────────────────────
// Eén venster met alle wedstrijden van alle categorieën onder elkaar, chronologisch zodra de
// uren gezet zijn. Bovenaan het veldoverzicht: per veld een echt krachtbalveld (hetzelfde
// veldschema als in de analyse) met daarop wat er nú speelt of erna komt. De organisatie stelt
// het aantal velden in en wijst elke wedstrijd aan een veld toe; supporters lezen gewoon mee.

const POLL_MS = 10000

const tijdBE = (iso: string) =>
  new Date(iso).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels' })

// Chronologisch: geplande eerst (op uur), dan ongeplande; afgelopen zakken naar hun eigen uur —
// zo leest de lijst als het dagverloop zelf.
function sorteer(matches: GroepMatch[]): GroepMatch[] {
  return [...matches]
    .filter((m) => m.home && m.away)
    .sort((a, b) => {
      const ta = a.plannedAt ? new Date(a.plannedAt).getTime() : Infinity
      const tb = b.plannedAt ? new Date(b.plannedAt).getTime() : Infinity
      if (ta !== tb) return ta - tb
      if (a.reeksNaam !== b.reeksNaam) return a.reeksNaam.localeCompare(b.reeksNaam, 'nl')
      return a.position - b.position
    })
}

function LiveKlok({ m }: { m: GroepMatch }) {
  const clock = useTicking(m.clockSeconds, m.clockRunning)
  return <>{fmtClock(clock)}</>
}

function VeldKaartje({ nr, data, nu }: { nr: number; data: GroepData; nu: number | null }) {
  // Wat toont dit veld? Een lopende wedstrijd wint; anders de eerstvolgende geplande.
  const opVeld = data.matches.filter((m) => m.veld === nr && m.home && m.away)
  const live = opVeld.find((m) => m.status === 'live')
  const volgende = sorteer(opVeld.filter((m) => m.status === 'pending'))[0]
  const m = live ?? volgende ?? null
  const stijl = {
    ...(m?.home && data.kleuren[m.home] ? { '--dpv-a': data.kleuren[m.home] } : {}),
    ...(m?.away && data.kleuren[m.away] ? { '--dpv-b': data.kleuren[m.away] } : {}),
  } as CSSProperties

  return (
    <div className={`dp-veld${live ? ' live' : ''}`} style={stijl}>
      {/* Het echte krachtbalveld (zelfde veldschema als de analyse) als decor: één speelhelft,
          zodat doelgebied en vrijworplijn duidelijk herkenbaar in beeld staan. */}
      <FieldSchema className="dp-veld-svg" goalAreaDepthM={10} half="bottom" />
      <div className="dp-veld-overlay">
        <span className="dp-veld-nr">Veld {nr}</span>
        {m ? (
          <>
            <span className={`dp-veld-status ${m.status}${!live && nu != null && m.plannedAt && new Date(m.plannedAt).getTime() <= nu ? ' nu' : ''}`}>
              {live
                ? <>● LIVE · H{m.currentHalf} · <LiveKlok m={m} /></>
                : nu != null && m.plannedAt && new Date(m.plannedAt).getTime() <= nu
                  ? '⏰ kan starten'
                  : m.plannedAt
                    ? tijdBE(m.plannedAt)
                    : 'volgt'}
            </span>
            <span className="dp-veld-affiche">
              {m.home && (
                <TeamLogo name={m.home} logoUrl={data.logos[m.home] ?? null} logoFit={data.fits[m.home] ?? null} side="home" size="2em" ringColor={data.kleuren[m.home]} />
              )}
              {live ? (
                <span className="dp-veld-score">{m.score.home} – {m.score.away}</span>
              ) : (
                <span className="dp-veld-vs">vs</span>
              )}
              {m.away && (
                <TeamLogo name={m.away} logoUrl={data.logos[m.away] ?? null} logoFit={data.fits[m.away] ?? null} side="away" size="2em" ringColor={data.kleuren[m.away]} />
              )}
            </span>
            <span className="dp-veld-namen">{m.home} – {m.away}</span>
            <span className="dp-veld-reeks">{m.reeksNaam}</span>
          </>
        ) : (
          <span className="dp-veld-vrij">— vrij —</span>
        )}
      </div>
    </div>
  )
}

export function Dagprogramma({ naam, initial, canManage }: { naam: string; initial: GroepData; canManage: boolean }) {
  const [data, setData] = useState<GroepData>(initial)
  // "Nu" bestaat pas na het mounten (anders hydration-mismatch); per halve minuut verversen is zat.
  const [nu, setNu] = useState<number | null>(null)
  useEffect(() => {
    setNu(Date.now())
    const t = setInterval(() => setNu(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])
  const [busy, setBusy] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [velden, setVelden] = useState<number>(initial.veldCount ?? 1)

  const laad = async () => {
    try {
      const r = await fetch(`/api/tornooi-groep?naam=${encodeURIComponent(naam)}`, { cache: 'no-store' })
      if (r.ok) setData((await r.json()) as GroepData)
    } catch {
      /* volgende poll probeert opnieuw */
    }
  }
  useEffect(() => {
    const t = setInterval(() => void laad(), POLL_MS)
    return () => clearInterval(t)
    // eslint-disable-next-line
  }, [naam])

  const wedstrijden = useMemo(() => sorteer(data.matches), [data.matches])
  // Wedstrijdduur per reeks (2×N min): zo kan de organisatie inschatten hoelang alles duurt.
  const duurPerReeks = useMemo(() => {
    const uit = new Map<string, number>()
    for (const r of data.reeksen) uit.set(r.naam, r.duurMin)
    return uit
  }, [data.reeksen])

  // Voor de organisatie: wat is de EERSTVOLGENDE wedstrijd per veld? Die "gaat starten" —
  // en zodra haar geplande uur verstreken is, mag ze effectief beginnen (⏰ kan starten).
  const volgendePerVeld = useMemo(() => {
    const uit = new Map<number, number>()
    for (const m of wedstrijden) {
      if (m.status !== 'pending' || m.veld == null) continue
      if (!uit.has(m.veld)) uit.set(m.veld, m.id)
    }
    return uit
  }, [wedstrijden])

  const rijStatus = (m: GroepMatch): { label: React.ReactNode; cls: string } => {
    // Gestart: toon hoelang er al gespeeld wordt (tikt lokaal mee tussen twee polls).
    if (m.status === 'live')
      return { label: <>● LIVE · H{m.currentHalf} · <LiveKlok m={m} /> · {m.score.home}–{m.score.away}</>, cls: 'live' }
    if (m.status === 'finished') return { label: `${m.score.home}–${m.score.away}`, cls: 'finished' }
    const isVolgende = m.veld != null && volgendePerVeld.get(m.veld) === m.id
    if (isVolgende && nu != null && m.plannedAt && new Date(m.plannedAt).getTime() <= nu)
      return { label: '⏰ kan starten', cls: 'nu' }
    if (isVolgende) return { label: 'straks', cls: 'straks' }
    return { label: 'te spelen', cls: 'pending' }
  }

  // Aantal velden bewaren op de eerste reeks van de dag (de loader leest de eerste ingestelde).
  const bewaarVelden = async () => {
    const eerste = data.reeksen[0]
    if (!eerste) return
    setBusy(true)
    setFout(null)
    try {
      const res = await fetch(`/api/tournament/${eerste.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ actie: 'velden', velden }),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(d.error || 'Bewaren mislukt.')
      await laad()
    } catch (e) {
      setFout((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Wedstrijd aan een veld toewijzen — het antwoord is per reeks, dus we herladen de hele groep.
  const zetVeld = async (m: GroepMatch, veld: string) => {
    setFout(null)
    try {
      const res = await fetch(`/api/tournament/${m.tournamentId}/match/${m.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'veld', veld: veld || null }),
      })
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || 'Toewijzen mislukt.')
      await laad()
    } catch (e) {
      setFout((e as Error).message)
    }
  }

  const aantalVelden = data.veldCount ?? 0

  return (
    <div className="trn-page dp">
      <header className="trn-top">
        <Link href={`/tornooi/groep/${encodeURIComponent(naam)}`} className="trn-home">
          <span className="brand">Krachtbal</span> · {naam}
        </Link>
        <nav className="trn-topnav">
          <Link href={`/tornooi/groep/${encodeURIComponent(naam)}`} className="trn-toplink">Categorieën →</Link>
        </nav>
      </header>

      <div className="trn-hub-head">
        <h1 className="trn-hub-title">📋 Dagprogramma</h1>
        <p className="trn-hub-intro">Alle wedstrijden van de dag onder elkaar — met per veld wat er speelt en wat er komt.</p>
      </div>

      {canManage && (
        <div className="dp-velden-instel">
          <span>Aantal velden op deze tornooidag</span>
          <span className="trn-stepper">
            <button type="button" onClick={() => setVelden((v) => Math.max(1, v - 1))} aria-label="Minder velden">−</button>
            <input value={velden} readOnly aria-label="Aantal velden" />
            <button type="button" onClick={() => setVelden((v) => Math.min(12, v + 1))} aria-label="Meer velden">+</button>
          </span>
          <button type="button" className="trn-btn" disabled={busy || velden === (data.veldCount ?? 0)} onClick={() => void bewaarVelden()}>
            Bewaren
          </button>
        </div>
      )}

      {aantalVelden >= 1 && (
        <section className="dp-velden" aria-label="Veldoverzicht">
          {Array.from({ length: aantalVelden }, (_, i) => (
            <VeldKaartje key={i + 1} nr={i + 1} data={data} nu={nu} />
          ))}
        </section>
      )}

      <section className="dp-lijst" aria-label="Alle wedstrijden">
        <h2 className="trn-col-title">Alle wedstrijden</h2>
        {wedstrijden.length === 0 && <p className="trn-empty">Nog geen wedstrijden met twee gekende ploegen.</p>}
        <ul>
          {wedstrijden.map((m) => (
            <li key={`${m.tournamentId}-${m.id}`} className={`dp-rij ${m.status}`}>
              <span className="dp-uur">{m.plannedAt ? tijdBE(m.plannedAt) : '—'}</span>
              <span className="dp-affiche">
                {m.home && (
                  <TeamLogo name={m.home} logoUrl={data.logos[m.home] ?? null} logoFit={data.fits[m.home] ?? null} side="home" size="1.6em" ringColor={m.home ? data.kleuren[m.home] : undefined} />
                )}
                <span className="dp-namen">
                  {m.home} <em>–</em> {m.away}
                </span>
                {m.away && (
                  <TeamLogo name={m.away} logoUrl={data.logos[m.away] ?? null} logoFit={data.fits[m.away] ?? null} side="away" size="1.6em" ringColor={m.away ? data.kleuren[m.away] : undefined} />
                )}
              </span>
              <span className="dp-reeks">{m.reeksNaam}</span>
              {duurPerReeks.get(m.reeksNaam) != null && (
                <span className="dp-duur" title="Wedstrijdduur">2×{duurPerReeks.get(m.reeksNaam)}&#8242;</span>
              )}
              {(() => {
                const st = rijStatus(m)
                return <span className={`dp-status ${st.cls}`}>{st.label}</span>
              })()}
              {canManage && m.status !== 'finished' && (
                <Link href={`/tornooi/${m.tournamentId}/aantekenen/${m.id}`} className="trn-mini">Aantekenen</Link>
              )}
              {canManage ? (
                <select
                  className="dp-veldkeuze"
                  value={m.veld ?? ''}
                  onChange={(e) => void zetVeld(m, e.target.value)}
                  aria-label="Veld toewijzen"
                >
                  <option value="">veld —</option>
                  {Array.from({ length: Math.max(aantalVelden, m.veld ?? 0) }, (_, i) => (
                    <option key={i + 1} value={i + 1}>Veld {i + 1}</option>
                  ))}
                </select>
              ) : (
                m.veld != null && <span className="dp-veldtag">Veld {m.veld}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {fout && <p className="trn-error">{fout}</p>}
    </div>
  )
}
