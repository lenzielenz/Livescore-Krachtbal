'use client'

import Link from 'next/link'
import React, { useEffect, useMemo, useState, type CSSProperties } from 'react'

import { FieldSchema } from '@/components/FieldSchema'
import { TeamLogo } from '@/components/TeamLogo'
import type { GroepData, GroepMatch } from '@/lib/tornooi-groep'
import { PRONOSTIEK_OP_DAGPROGRAMMA } from '@/lib/pronostiek-schakelaar'
import { TornooiPronostiek } from '../TornooiPronostiek'
import { fmtClock, useTicking } from '../../../useTournament'

// ── Dagprogramma van een tornooidag ──────────────────────────────────────────────────────────
// Eén venster met alle wedstrijden van alle categorieën onder elkaar, chronologisch zodra de
// uren gezet zijn. Bovenaan het veldoverzicht: per veld een echt krachtbalveld (hetzelfde
// veldschema als in de analyse) met daarop wat er nú speelt of erna komt. De organisatie stelt
// het aantal velden in en wijst elke wedstrijd aan een veld toe; supporters lezen gewoon mee.

const POLL_MS = 10000

const tijdBE = (iso: string) =>
  new Date(iso).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels' })

/** Kalenderdag in Brussel (yyyy-mm-dd) — sleutel om wedstrijden per dag te groeperen. */
const dagSleutel = (iso: string) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Brussels' })
/** Volle datum: "zaterdag 5 september". */
const datumBE = (iso: string) =>
  new Date(iso).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Brussels' })

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

export function Dagprogramma({
  naam,
  initial,
  canManage,
  ingelogd,
}: {
  naam: string
  initial: GroepData
  canManage: boolean
  /** Ingelogd? Dan mag je meespelen met de pronostiek (anders een nette inloglink). */
  ingelogd: boolean
}) {
  const [data, setData] = useState<GroepData>(initial)
  // "Nu" bestaat pas na het mounten (anders hydration-mismatch); per halve minuut verversen is zat.
  const [nu, setNu] = useState<number | null>(null)
  useEffect(() => {
    setNu(Date.now())
    const t = setInterval(() => setNu(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])
  const [fout, setFout] = useState<string | null>(null)
  // Eigen pronostiek-tips van deze supporter (andermans tips blijven verborgen tot na de match).
  const [picks, setPicks] = useState<Record<number, { home: number; away: number }>>({})
  useEffect(() => {
    if (!ingelogd || !PRONOSTIEK_OP_DAGPROGRAMMA) return
    void fetch(`/api/tornooi-pronostiek?groep=${encodeURIComponent(naam)}`, { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.picks) setPicks(d.picks as Record<number, { home: number; away: number }>)
      })
      .catch(() => undefined)
  }, [naam, ingelogd])

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

  // Alle speeldagen van dit evenement (meestal één) — voedt zowel de kop als de dag-splitsing.
  const dagen = useMemo(() => {
    const uit = new Map<string, string>()
    for (const m of wedstrijden) if (m.plannedAt) uit.set(dagSleutel(m.plannedAt), m.plannedAt)
    return [...uit.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [wedstrijden])

  // Kop-status: aankondiging (nog x nachtjes), vandaag, of afgesloten na de laatste dag.
  const dagKop = useMemo(() => {
    if (nu == null || dagen.length === 0) return null
    const vandaag = new Date(nu).toLocaleDateString('sv-SE', { timeZone: 'Europe/Brussels' })
    const eerste = dagen[0][0]
    const laatste = dagen[dagen.length - 1][0]
    const alGespeeld = wedstrijden.some((m) => m.status !== 'pending')
    const allesGedaan = wedstrijden.length > 0 && wedstrijden.every((m) => m.status === 'finished')
    if (vandaag > laatste || allesGedaan) return { cls: 'gesloten', label: `🏁 Afgelopen — ${datumBE(dagen[dagen.length - 1][1])}` }
    if (vandaag >= eerste && vandaag <= laatste) {
      const vandaagIso = dagen.find(([d]) => d === vandaag)?.[1]
      return {
        cls: alGespeeld ? 'vandaag bezig' : 'vandaag',
        label: `📍 VANDAAG · ${datumBE(vandaagIso ?? dagen[0][1])}`,
      }
    }
    const dagenTot = Math.ceil((new Date(`${eerste}T12:00:00`).getTime() - new Date(`${vandaag}T12:00:00`).getTime()) / 86400000)
    return {
      cls: 'aankondiging',
      label: `📣 ${datumBE(dagen[0][1])} — nog ${dagenTot} ${dagenTot === 1 ? 'nachtje' : 'nachtjes'} slapen`,
    }
  }, [nu, dagen, wedstrijden])
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
        {/* Wanneer speelt dit evenement? Vóór de dag een aankondiging met het aantal nachtjes
            slapen, op de dag zelf "VANDAAG", en erna netjes afgesloten. */}
        {dagKop && <div className={`dp-datum ${dagKop.cls}`}>{dagKop.label}</div>}
        <p className="trn-hub-intro">Alle wedstrijden van de dag onder elkaar — met per veld wat er speelt en wat er komt.</p>
      </div>


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
          {wedstrijden.map((m, i) => {
            // Splitsing per speeldag: bij een nieuwe dag een kop met datum, aantal wedstrijden
            // en hoeveel er al gespeeld zijn.
            const dag = m.plannedAt ? dagSleutel(m.plannedAt) : ''
            const vorige = i > 0 ? (wedstrijden[i - 1].plannedAt ? dagSleutel(wedstrijden[i - 1].plannedAt as string) : '') : null
            const nieuweDag = i === 0 || dag !== vorige
            const vanDag = wedstrijden.filter((x) => (x.plannedAt ? dagSleutel(x.plannedAt) : '') === dag)
            const gedaan = vanDag.filter((x) => x.status === 'finished').length
            const isVandaag = nu != null && dag === new Date(nu).toLocaleDateString('sv-SE', { timeZone: 'Europe/Brussels' })
            return (
            <React.Fragment key={`${m.tournamentId}-${m.id}`}>
              {nieuweDag && (
                <li className={`dp-dagkop${isVandaag ? ' vandaag' : ''}`}>
                  <span className="dp-dagkop-naam">{m.plannedAt ? datumBE(m.plannedAt) : 'Nog te plannen'}</span>
                  <span className="dp-dagkop-telling">
                    {vanDag.length} wedstrijd{vanDag.length === 1 ? '' : 'en'}
                    {gedaan > 0 ? ` · ${gedaan} gespeeld` : ''}
                  </span>
                </li>
              )}
              {(
            <li className={`dp-rij ${m.status}`}>
              <span className="dp-uur">{m.plannedAt ? tijdBE(m.plannedAt) : '—'}</span>
              {/* Affiche: thuislogo links, uitlogo rechts, de namen ertussen. De namen mogen
                  over twee regels lopen i.p.v. hard afgekapt te worden. */}
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
              {/* Eén rustige metaregel met al de rest. */}
              <span className="dp-meta">
                {(() => {
                  const st = rijStatus(m)
                  return <span className={`dp-status ${st.cls}`}>{st.label}</span>
                })()}
                {m.veld != null && <span className="dp-veldtag">Veld {m.veld}</span>}
                <span className="dp-reeks">{m.reeksNaam}</span>
                {duurPerReeks.get(m.reeksNaam) != null && (
                  <span className="dp-duur" title="Wedstrijdduur">2×{duurPerReeks.get(m.reeksNaam)}&#8242;</span>
                )}
                {canManage && m.status !== 'finished' && (
                  <Link href={`/tornooi/${m.tournamentId}/aantekenen/${m.id}`} className="trn-mini dp-aantekenen">Aantekenen</Link>
                )}
              </span>
              {/* Pronostiek staat hier uit: dit overzicht werd er te druk van. Meespelen doe je
                  bij de categorie zelf (zie lib/pronostiek-schakelaar.ts). */}
              {PRONOSTIEK_OP_DAGPROGRAMMA && m.status === 'pending' && m.home && m.away && (
                <TornooiPronostiek
                  matchId={m.id}
                  home={m.home}
                  away={m.away}
                  ingelogd={ingelogd}
                  terug={`/tornooi/groep/${encodeURIComponent(naam)}/programma`}
                  bestaand={picks[m.id] ?? null}
                />
              )}
            </li>
              )}
            </React.Fragment>
            )
          })}
        </ul>
      </section>

      {fout && <p className="trn-error">{fout}</p>}
    </div>
  )
}
