'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import { TeamLogo } from '@/components/TeamLogo'
import type { GroepData, GroepMatch } from '@/lib/tornooi-groep'
import { fmtClock, useTicking } from '../../../useTournament'

// ── Het zelfaanpassende kantinescherm van een tornooidag ─────────────────────────────────────
// Eén link die je 's ochtends opent en de hele dag laat staan:
//  • niets bezig → groot aftellen naar de volgende geplande wedstrijd(en);
//  • één wedstrijd bezig → die staat schermvullend;
//  • meerdere bezig → het raster verdeelt zichzelf netjes (2, 3, 4 … naast/onder elkaar);
//  • wordt er één afgesloten, dan past het scherm zich vanzelf weer aan.
// Elk bord draagt de kleuren van de twee clubs; scoort er iemand, dan neemt een schermvullende
// viering met het clublogo even het hele scherm over. De organiserende club kleurt de rest
// (--gk-a/--gk-b). Data via de publieke groep-API (poll om de 5 s).

const POLL_MS = 5000
const VIERING_MS = 6000

// Rasterindeling naar aantal live borden — zelfde filosofie als het club-kantinescherm.
function kolommenVoor(n: number): number {
  if (n <= 1) return 1
  if (n <= 4) return 2
  if (n <= 9) return 3
  return 4
}

function LiveBord({ m, groot, logos, kleuren }: { m: GroepMatch; groot: boolean; logos: Record<string, string>; kleuren: Record<string, string> }) {
  const clock = useTicking(m.clockSeconds, m.clockRunning)
  const logoMaat = groot ? 'clamp(72px, 14vmin, 170px)' : 'clamp(48px, 8vmin, 110px)'
  // Clubkleuren dragen het bord (zelfde taal als de live-bordkaarten van de competitie).
  const stijl = {
    ...(m.home && kleuren[m.home] ? { '--bc-a': kleuren[m.home] } : {}),
    ...(m.away && kleuren[m.away] ? { '--bc-b': kleuren[m.away] } : {}),
  } as CSSProperties
  return (
    <div className={`gk-bord${groot ? ' groot' : ''}`} style={stijl}>
      {/* Drie vaste kolommen (label · reeks · klok): de reeks staat groot en exact gecentreerd,
          zodat iedereen in de kantine in één oogopslag ziet wélke reeks er speelt. */}
      <div className="gk-bord-kop">
        <span className="gk-bord-label">{m.label}</span>
        <span className="gk-bord-reeks">{m.reeksNaam}</span>
        <span className="gk-bord-klok">H{m.currentHalf} · {fmtClock(clock)}</span>
      </div>
      <div className="gk-bord-body">
        <span className="gk-bord-ploeg">
          {m.home && <TeamLogo name={m.home} logoUrl={logos[m.home] ?? null} side="home" size={logoMaat} ringColor={m.home ? kleuren[m.home] : undefined} />}
          <span className="gk-bord-team">{m.home ?? '—'}</span>
        </span>
        <span className="gk-bord-score">{m.score.home} – {m.score.away}</span>
        <span className="gk-bord-ploeg uit">
          {m.away && <TeamLogo name={m.away} logoUrl={logos[m.away] ?? null} side="away" size={logoMaat} ringColor={m.away ? kleuren[m.away] : undefined} />}
          <span className="gk-bord-team">{m.away ?? '—'}</span>
        </span>
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

// Schermvullende doelpunt-viering: clubkleur-burst + logo + hoeveel punten erbij kwamen.
type Viering = { key: number; team: string; punten: number; kleur: string | null; logo: string | null; reeks: string }

function VieringOverlay({ v }: { v: Viering }) {
  return (
    <div className="gk-viering" style={{ ...(v.kleur ? { '--vc': v.kleur } : {}) } as CSSProperties} aria-live="polite">
      <div className="gk-viering-burst" aria-hidden />
      <div className="gk-viering-inhoud">
        <span className="gk-viering-logo">
          <TeamLogo name={v.team} logoUrl={v.logo} side="home" size="clamp(140px, 34vmin, 380px)" ringColor={v.kleur ?? undefined} />
        </span>
        <span className="gk-viering-punten">+{v.punten}</span>
        <span className="gk-viering-titel">DOELPUNT!</span>
        <span className="gk-viering-team">{v.team}</span>
        <span className="gk-viering-reeks">{v.reeks}</span>
      </div>
    </div>
  )
}

export function GroepKantine({ naam, initial }: { naam: string; initial: GroepData }) {
  const [data, setData] = useState<GroepData>(initial)
  // Volledig scherm voor de kantine-tv: geen browserbalk, alleen het bord.
  const [fullscreen, setFullscreen] = useState(false)
  useEffect(() => {
    const bijwerken = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', bijwerken)
    return () => document.removeEventListener('fullscreenchange', bijwerken)
  }, [])
  const wisselFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    else void document.documentElement.requestFullscreen().catch(() => undefined)
  }
  // Schermvergrendeling: de tv mag niet in slaap vallen tijdens de tornooidag. Best-effort
  // (niet elke browser ondersteunt het); na een tab-wissel vragen we ze opnieuw aan.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    const vraag = async () => {
      try {
        const wl = (navigator as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
        if (wl && document.visibilityState === 'visible') lock = await wl.request('screen')
      } catch {
        /* geen ondersteuning of geweigerd — geen probleem */
      }
    }
    void vraag()
    const opZicht = () => void vraag()
    document.addEventListener('visibilitychange', opZicht)
    return () => {
      document.removeEventListener('visibilitychange', opZicht)
      void lock?.release().catch(() => undefined)
    }
  }, [])
  const [viering, setViering] = useState<Viering | null>(null)
  // Vorige standen per wedstrijd — het verschil tussen twee polls IS het doelpunt.
  const vorige = useRef<Map<number, { home: number; away: number }>>(new Map())
  const vieringSeq = useRef(0)
  const vieringTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Eerste momentopname "leren" zonder te vieren (anders barst het scherm los bij het openen).
  useEffect(() => {
    for (const m of initial.matches) vorige.current.set(m.id, { ...m.score })
    // bewust enkel bij mount: latere standen leert de poll-lus zelf bij
  }, []) // eslint-disable-line

  useEffect(() => {
    let actief = true
    const laad = async () => {
      try {
        const r = await fetch(`/api/tornooi-groep?naam=${encodeURIComponent(naam)}`, { cache: 'no-store' })
        if (!r.ok) return
        const d = (await r.json()) as GroepData
        if (!actief) return

        // Doelpunt gedetecteerd? Vier het schermvullend, met het logo en de kleur van die club.
        for (const m of d.matches) {
          const oud = vorige.current.get(m.id)
          if (oud && m.status === 'live') {
            const kant = m.score.home > oud.home ? ('home' as const) : m.score.away > oud.away ? ('away' as const) : null
            if (kant) {
              const team = kant === 'home' ? m.home : m.away
              if (team) {
                const punten = kant === 'home' ? m.score.home - oud.home : m.score.away - oud.away
                const key = ++vieringSeq.current
                setViering({ key, team, punten, kleur: d.kleuren[team] ?? null, logo: d.logos[team] ?? null, reeks: m.reeksNaam })
                if (vieringTimer.current) clearTimeout(vieringTimer.current)
                vieringTimer.current = setTimeout(() => setViering((v) => (v && v.key === key ? null : v)), VIERING_MS)
              }
            }
          }
          vorige.current.set(m.id, { ...m.score })
        }
        setData(d)
      } catch {
        /* netwerkfout — volgende poll probeert opnieuw */
      }
    }
    const t = setInterval(laad, POLL_MS)
    return () => {
      actief = false
      clearInterval(t)
      if (vieringTimer.current) clearTimeout(vieringTimer.current)
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

  // Look van de organiserende club: haar kleuren dragen het scherm (val terug op de huisstijl).
  const stijl = {
    ...(data.host?.colorPrimary ? { '--gk-a': data.host.colorPrimary } : {}),
    ...(data.host?.colorSecondary ? { '--gk-b': data.host.colorSecondary } : {}),
  } as CSSProperties

  return (
    <div className="gk-scherm" style={stijl}>
      {viering && <VieringOverlay key={viering.key} v={viering} />}
      <header className="gk-kop">
        <span className="gk-titel">
          {data.host?.logoUrl && (
            <img className="gk-hostlogo" src={data.host.logoUrl} alt={data.host.name || 'Organiserende club'} />
          )}
          <span><span className="brand">Krachtbal</span> · {data.naam}</span>
        </span>
        <span className="gk-kop-rechts">
          <span className="gk-kop-status">
            {live.length > 0 ? `● ${live.length} bezig` : komend.length > 0 ? `${komend.length} nog te spelen` : 'dag afgerond'}
          </span>
          {/* Volledig scherm: één tik en de tv toont enkel nog het bord (geen browserbalk). */}
          <button type="button" className="gk-fs-btn" onClick={wisselFullscreen} title={fullscreen ? 'Volledig scherm verlaten' : 'Volledig scherm'}>
            {fullscreen ? '✕ Verlaten' : '⛶ Volledig scherm'}
          </button>
        </span>
      </header>

      {live.length > 0 ? (
        <div className="gk-raster" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {live.map((m) => (
            <LiveBord key={m.id} m={m} groot={live.length === 1} logos={data.logos} kleuren={data.kleuren} />
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
          {/* Enkel de eerstvolgende affiche groot — de rest van de dag loopt in de ticker onderaan. */}
          <ul className="gk-komend">
            {komend.slice(0, 1).map((m) => (
              <li
                key={m.id}
                className="gk-komend-rij"
                style={{
                  ...(m.home && data.kleuren[m.home] ? { '--ka': data.kleuren[m.home] } : {}),
                  ...(m.away && data.kleuren[m.away] ? { '--kb': data.kleuren[m.away] } : {}),
                } as CSSProperties}
              >
                <span className="gk-komend-uur">{m.plannedAt ? tijdBE(m.plannedAt) : '—'}</span>
                <span className="gk-komend-affiche">
                  {m.home && (
                    <TeamLogo name={m.home} logoUrl={data.logos[m.home] ?? null} side="home" size="1.9em" ringColor={data.kleuren[m.home]} />
                  )}
                  <span className="gk-komend-team">{m.home}</span>
                  <span className="gk-komend-vs">VS</span>
                  <span className="gk-komend-team">{m.away}</span>
                  {m.away && (
                    <TeamLogo name={m.away} logoUrl={data.logos[m.away] ?? null} side="away" size="1.9em" ringColor={data.kleuren[m.away]} />
                  )}
                </span>
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

      {/* Alle nog te spelen wedstrijden schuiven in een doorlopende balk onderaan voorbij:
          gewoon de logo's tegen elkaar met het uur ernaast. Bij een handvol wedstrijden staat
          de balk stil (niets om te scrollen); daarboven loopt ze naadloos in een lus. */}
      {komend.length > 0 && <KomendTicker komend={komend} logos={data.logos} kleuren={data.kleuren} />}
    </div>
  )
}

function KomendTicker({ komend, logos, kleuren }: { komend: GroepMatch[]; logos: Record<string, string>; kleuren: Record<string, string> }) {
  const loop = komend.length >= 4
  // Snelheid schaalt met de lengte van de lijst: elke wedstrijd krijgt ± 5 s in beeld.
  const duur = `${Math.max(20, komend.length * 5)}s`
  const helft = (verborgen: boolean) => (
    <span className="gk-ticker-helft" aria-hidden={verborgen}>
      {komend.map((m) => (
        <span key={m.id} className="gk-tick">
          {m.home && <TeamLogo name={m.home} logoUrl={logos[m.home] ?? null} side="home" size="1.7em" ringColor={m.home ? kleuren[m.home] : undefined} />}
          <span className="gk-tick-vs">–</span>
          {m.away && <TeamLogo name={m.away} logoUrl={logos[m.away] ?? null} side="away" size="1.7em" ringColor={m.away ? kleuren[m.away] : undefined} />}
          {m.plannedAt && <span className="gk-tick-uur">{tijdBE(m.plannedAt)}</span>}
        </span>
      ))}
    </span>
  )
  return (
    <div className="gk-ticker">
      <div className={`gk-ticker-strook${loop ? ' loop' : ''}`} style={{ '--dur': duur } as CSSProperties}>
        {helft(false)}
        {/* Tweede identieke helft maakt de lus naadloos: -50% verschuiven = exact één helft. */}
        {loop && helft(true)}
      </div>
    </div>
  )
}
