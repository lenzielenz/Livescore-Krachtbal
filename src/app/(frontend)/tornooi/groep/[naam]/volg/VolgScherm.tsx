'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'

import { TeamLogo } from '@/components/TeamLogo'
import { opSpeeltijd } from '@/lib/tornooi-volgorde'
import type { GroepData, GroepMatch } from '@/lib/tornooi-groep'
import { fmtClock, useTicking } from '../../../useTournament'

// Hoe vaak we de dag opnieuw ophalen. Iets rustiger dan het kantinescherm (dat op stroom hangt);
// een gsm in een broekzak hoeft niet elke vijf seconden te vernieuwen.
const POLL_MS = 7000
// Hoe lang een gewijzigde stand oplicht. Kort genoeg om niet te storen, lang genoeg om te zien
// dat er net gescoord is terwijl je naar het scherm kijkt.
const FLITS_MS = 2600
/** Hoeveel gespeelde wedstrijden we tonen vóór "toon alles". */
const GESPEELD_EERST = 6

const tijdBE = (iso: string) =>
  new Date(iso).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels' })

/** Aftellen naar een tijdstip. Start pas na het mounten — op de server bestaat "nu" nog niet. */
function Aftel({ naar }: { naar: number }) {
  const [nu, setNu] = useState<number | null>(null)
  useEffect(() => {
    setNu(Date.now())
    const t = setInterval(() => setNu(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  if (nu == null) return <span className="vg-aftel">–:––</span>
  const rest = Math.floor((naar - nu) / 1000)
  if (rest <= 0) return <span className="vg-aftel nu">zo meteen</span>
  const u = Math.floor(rest / 3600)
  const m = Math.floor((rest % 3600) / 60)
  const s = rest % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return <span className="vg-aftel">{u > 0 ? `${u}:${p(m)}:${p(s)}` : `${m}:${p(s)}`}</span>
}

export function VolgScherm({
  naam,
  initial,
  magScoren,
}: {
  naam: string
  initial: GroepData
  magScoren: boolean
}) {
  const [data, setData] = useState<GroepData>(initial)
  const [allesTonen, setAllesTonen] = useState(false)
  // Welke wedstrijden net van stand veranderden — die lichten even op.
  const [geflitst, setGeflitst] = useState<Set<number>>(() => new Set())
  const vorigeStand = useRef<Map<number, string>>(new Map())

  // Bijwerken via dezelfde publieke dag-route die het kantinescherm voedt.
  useEffect(() => {
    let gestopt = false
    const haal = async () => {
      try {
        const res = await fetch(`/api/tornooi-groep?naam=${encodeURIComponent(naam)}`, { cache: 'no-store' })
        if (!res.ok) return
        const verse = (await res.json()) as GroepData | null
        if (!gestopt && verse && Array.isArray(verse.matches)) setData(verse)
      } catch {
        // Even geen netwerk (het is een tornooiveld): laat staan wat er staat, probeer straks weer.
      }
    }
    const t = setInterval(() => void haal(), POLL_MS)
    return () => {
      gestopt = true
      clearInterval(t)
    }
  }, [naam])

  // Een veranderde stand even laten oplichten — dát is wat "meeleven met de dag" voelt.
  useEffect(() => {
    const nieuw = new Set<number>()
    for (const m of data.matches) {
      const sleutel = `${m.score.home}-${m.score.away}-${m.status}`
      const vorig = vorigeStand.current.get(m.id)
      if (vorig !== undefined && vorig !== sleutel) nieuw.add(m.id)
      vorigeStand.current.set(m.id, sleutel)
    }
    if (nieuw.size === 0) return
    setGeflitst(nieuw)
    const t = setTimeout(() => setGeflitst(new Set()), FLITS_MS)
    return () => clearTimeout(t)
  }, [data])

  const live = useMemo(() => opSpeeltijd(data.matches.filter((m) => m.status === 'live')), [data.matches])
  const straks = useMemo(
    () => opSpeeltijd(data.matches.filter((m) => m.status === 'pending' && m.home && m.away)).slice(0, 4),
    [data.matches],
  )
  const gespeeld = useMemo(
    () =>
      data.matches
        .filter((m) => m.status === 'finished' && m.home && m.away)
        .sort((a, b) => (b.plannedAt ?? '').localeCompare(a.plannedAt ?? '')),
    [data.matches],
  )

  const eerstvolgende = straks.find((m) => m.plannedAt)?.plannedAt ?? null

  return (
    <div className="vg">
      <header className="vg-kop">
        <h1 className="vg-titel">🏆 {naam}</h1>
        <p className="vg-stand">
          {live.length > 0 ? (
            <>
              <span className="vg-punt" aria-hidden /> {live.length} wedstrijd{live.length === 1 ? '' : 'en'} bezig
            </>
          ) : eerstvolgende ? (
            <>Volgende om {tijdBE(eerstvolgende)} · <Aftel naar={new Date(eerstvolgende).getTime()} /></>
          ) : gespeeld.length > 0 ? (
            'Alle wedstrijden gespeeld'
          ) : (
            'Nog niet begonnen'
          )}
        </p>
        <nav className="vg-nav">
          <Link href={`/tornooi/groep/${encodeURIComponent(naam)}/programma`}>📋 Programma</Link>
          <Link href={`/tornooi/groep/${encodeURIComponent(naam)}/rangschikking`}>📊 Stand</Link>
          <Link href={`/tornooi/groep/${encodeURIComponent(naam)}`}>Alle reeksen →</Link>
        </nav>
      </header>

      {live.length > 0 && (
        <section className="vg-sec">
          <h2 className="vg-sectitel"><span className="vg-punt" aria-hidden /> Nu bezig</h2>
          <div className="vg-live">
            {live.map((m) => (
              <LiveKaart
                key={m.id}
                m={m}
                data={data}
                flits={geflitst.has(m.id)}
                magScoren={magScoren}
              />
            ))}
          </div>
        </section>
      )}

      {straks.length > 0 && (
        <section className="vg-sec">
          <h2 className="vg-sectitel">Straks</h2>
          <ul className="vg-straks">
            {straks.map((m) => (
              <li key={m.id} className="vg-straks-rij">
                <span className="vg-straks-uur">{m.plannedAt ? tijdBE(m.plannedAt) : '—'}</span>
                <span className="vg-straks-affiche">
                  <Ploegnaam naam={m.home} data={data} />
                  <em>–</em>
                  <Ploegnaam naam={m.away} data={data} />
                </span>
                <span className="vg-straks-meta">
                  {m.reeksNaam}
                  {m.veld != null && <> · veld {m.veld}</>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {gespeeld.length > 0 && (
        <section className="vg-sec">
          <h2 className="vg-sectitel">Al gespeeld</h2>
          <ul className="vg-uitslagen">
            {(allesTonen ? gespeeld : gespeeld.slice(0, GESPEELD_EERST)).map((m) => (
              <UitslagRij key={m.id} m={m} data={data} />
            ))}
          </ul>
          {/* Niet stilzwijgend afkappen: zeg hoeveel er nog zijn. */}
          {!allesTonen && gespeeld.length > GESPEELD_EERST && (
            <button type="button" className="vg-meer" onClick={() => setAllesTonen(true)}>
              Toon alle {gespeeld.length} uitslagen
            </button>
          )}
        </section>
      )}

      {live.length === 0 && straks.length === 0 && gespeeld.length === 0 && (
        <p className="vg-leeg">Er staat nog niets ingepland voor deze tornooidag.</p>
      )}
    </div>
  )
}

function Ploegnaam({ naam, data }: { naam: string | null; data: GroepData }) {
  if (!naam) return <span className="vg-ploegnaam">— te bepalen —</span>
  return (
    <span className="vg-ploegnaam">
      <TeamLogo name={naam} logoUrl={data.logos[naam] ?? null} logoFit={data.fits[naam] ?? null} size="1.4em" />
      {naam}
    </span>
  )
}

function LiveKaart({
  m,
  data,
  flits,
  magScoren,
}: {
  m: GroepMatch
  data: GroepData
  flits: boolean
  magScoren: boolean
}) {
  // De klok tikt lokaal door tussen twee ophaalrondes — anders loopt hij met horten en stoten.
  const clock = useTicking(m.clockSeconds, m.clockRunning)
  const kleur = (naam: string | null) => (naam ? data.kleuren[naam] : undefined)
  return (
    <article
      className={`vg-kaart${flits ? ' flits' : ''}`}
      style={
        {
          ...(kleur(m.home) ? { '--ka': kleur(m.home) } : {}),
          ...(kleur(m.away) ? { '--kb': kleur(m.away) } : {}),
        } as React.CSSProperties
      }
    >
      <div className="vg-kaart-kop">
        <span className="vg-reeks">{m.reeksNaam}</span>
        {m.veld != null && <span className="vg-veld">Veld {m.veld}</span>}
        <span className="vg-klok">H{m.currentHalf} · {fmtClock(clock)}</span>
      </div>
      <div className="vg-kaart-body">
        <span className="vg-kant">
          {m.home && <TeamLogo name={m.home} logoUrl={data.logos[m.home] ?? null} logoFit={data.fits[m.home] ?? null} side="home" size="3.2em" ringColor={kleur(m.home)} />}
          <span className="vg-kant-naam">{m.home ?? '—'}</span>
        </span>
        <span className="vg-score">{m.score.home}<span className="vg-streep">–</span>{m.score.away}</span>
        <span className="vg-kant">
          {m.away && <TeamLogo name={m.away} logoUrl={data.logos[m.away] ?? null} logoFit={data.fits[m.away] ?? null} side="away" size="3.2em" ringColor={kleur(m.away)} />}
          <span className="vg-kant-naam">{m.away ?? '—'}</span>
        </span>
      </div>
      <div className="vg-kaart-voet">
        <span title="Kruisjes">✖ {m.crosses.home}–{m.crosses.away}</span>
        <span title="Aangevraagde minuten">⏱ {m.timeouts.home}–{m.timeouts.away}</span>
        {/* Wie deze stand doorgeeft — dezelfde bronvermelding als op het tornooibord. */}
        {m.aantekenaar && <span className="vg-bron">✏️ {m.aantekenaar.tekst}</span>}
      </div>
      {magScoren && (
        <Link href={`/tornooi/${m.tournamentId}/aantekenen/${m.id}`} className="vg-cta">
          ✏️ Aantekenen — verder scoren →
        </Link>
      )}
    </article>
  )
}

function UitslagRij({ m, data }: { m: GroepMatch; data: GroepData }) {
  const gelijk = m.winner == null
  return (
    <li className={`vg-uit${gelijk ? ' gelijk' : ''}`}>
      <span className="vg-uit-reeks">{m.reeksNaam}</span>
      <span className="vg-uit-rij">
        <span className={`vg-uit-kant${m.winner === 'home' ? ' wint' : ''}`}>
          {m.home && <TeamLogo name={m.home} logoUrl={data.logos[m.home] ?? null} logoFit={data.fits[m.home] ?? null} size="1.5em" />}
          <span className="vg-uit-naam">{m.home}</span>
        </span>
        <span className="vg-uit-score">{m.score.home}<span className="vg-streep">–</span>{m.score.away}</span>
        <span className={`vg-uit-kant rechts${m.winner === 'away' ? ' wint' : ''}`}>
          <span className="vg-uit-naam">{m.away}</span>
          {m.away && <TeamLogo name={m.away} logoUrl={data.logos[m.away] ?? null} logoFit={data.fits[m.away] ?? null} size="1.5em" />}
        </span>
      </span>
    </li>
  )
}
