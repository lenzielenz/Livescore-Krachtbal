'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import { TeamLogo } from '@/components/TeamLogo'
import type { LogoFit } from '@/lib/logo-fit'
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
// Hoe lang een doelpuntviering in beeld blijft. Bewust kort: op een drukke tornooidag lopen er
// twee wedstrijden tegelijk, dus een viering moet klaar zijn vóór de volgende eraan komt. De
// rugworp krijgt iets meer tijd — die heeft een raketvlucht én een inslag te vertellen.
const VIERING_MS = 2400
const VIERING_RAKET_MS = 3400
// Fotoshow: 3-2-1 meetellen, dan de foto heel even in beeld en weer weg.
const FOTO_TEL_VANAF = 3
const FOTO_TOON_MS = 6500

// Rasterindeling naar aantal live borden — zelfde filosofie als het club-kantinescherm.
function kolommenVoor(n: number): number {
  if (n <= 1) return 1
  if (n <= 4) return 2
  if (n <= 9) return 3
  return 4
}

function LiveBord({ m, groot, logos, kleuren, fits }: { m: GroepMatch; groot: boolean; logos: Record<string, string>; kleuren: Record<string, string>; fits: Record<string, LogoFit> }) {
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
        <span className="gk-bord-label">
          {m.label}
          {m.veld != null && <span className="gk-bord-veld">Veld {m.veld}</span>}
        </span>
        <span className="gk-bord-reeks">{m.reeksNaam}</span>
        {/* De speeltijd is wat de kantine het vaakst zoekt: groot, in tabulaire cijfers, met een
            kloppend stipje zolang ze loopt. Staat ze stil, dan zegt het bord dat ook — een
            bevroren tijd zonder uitleg laat iedereen denken dat het scherm hangt. */}
        <span className={`gk-bord-klok${m.clockRunning ? ' loopt' : ''}`}>
          <span className="gk-klok-half">H{m.currentHalf}</span>
          <span className="gk-klok-tijd">{fmtClock(clock)}</span>
          <span className="gk-klok-staat">{m.clockRunning ? <span className="gk-klok-stip" aria-hidden /> : 'pauze'}</span>
        </span>
      </div>
      <div className="gk-bord-body">
        <span className="gk-bord-ploeg">
          {m.home && <TeamLogo name={m.home} logoUrl={logos[m.home] ?? null} logoFit={fits[m.home] ?? null} side="home" size={logoMaat} ringColor={m.home ? kleuren[m.home] : undefined} />}
          <span className="gk-bord-team">{m.home ?? '—'}</span>
        </span>
        <span className="gk-bord-score">{m.score.home} – {m.score.away}</span>
        <span className="gk-bord-ploeg uit">
          {m.away && <TeamLogo name={m.away} logoUrl={logos[m.away] ?? null} logoFit={fits[m.away] ?? null} side="away" size={logoMaat} ringColor={m.away ? kleuren[m.away] : undefined} />}
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
// Bij +1 (nekworp) groeit en draait het logo van de scorende club; bij +2 (rugworp) vliegt
// een raket naar het logo van de tegenstander en ontploft erop — dé special voor 2 punten.
type Viering = {
  key: number
  /** Scoorde de thuis- of de uitploeg? Bepaalt de vliegrichting van de raket. */
  kant: 'home' | 'away'
  team: string
  punten: number
  kleur: string | null
  logo: string | null
  fit: LogoFit | null
  reeks: string
  tegen: string | null
  tegenLogo: string | null
  tegenFit: LogoFit | null
  tegenKleur: string | null
}

/** Een rugworp (+2) toont een raketvlucht en mag daarom iets langer duren dan een nekworp. */
const vieringDuur = (v: { punten: number; tegen: string | null }) =>
  v.punten === 2 && v.tegen ? VIERING_RAKET_MS : VIERING_MS

function VieringOverlay({ v, ms }: { v: Viering; ms: number }) {
  const raket = v.punten === 2 && Boolean(v.tegen)
  // De thuisploeg staat links en de uitploeg rechts — exact zoals op het scorebord erboven.
  // Scoort de uitploeg, dan vertrekt de raket dus rechts en vliegt hij naar links; anders zou
  // hij op het verkeerde logo inslaan (de kijker ziet die twee clubs net in die volgorde staan).
  const naarLinks = raket && v.kant === 'away'
  const scorer = { naam: v.team, logo: v.logo, fit: v.fit, kleur: v.kleur }
  const doel = { naam: v.tegen as string, logo: v.tegenLogo, fit: v.tegenFit, kleur: v.tegenKleur }
  const links = naarLinks ? doel : scorer
  const rechts = naarLinks ? scorer : doel
  const zijde = (t: typeof scorer, isDoel: boolean, side: 'home' | 'away') => (
    <span className={isDoel ? 'gk-raket-doel' : 'gk-raket-af'}>
      {isDoel && <span className="gk-boem" aria-hidden>💥</span>}
      <span className={isDoel ? 'gk-raket-doel-logo' : undefined}>
        <TeamLogo name={t.naam} logoUrl={t.logo} logoFit={t.fit} side={side} size="clamp(110px, 24vmin, 260px)" ringColor={t.kleur ?? undefined} />
      </span>
    </span>
  )
  return (
    <div
      className={`gk-viering${raket ? ' raket' : ''}`}
      style={{ ...(v.kleur ? { '--vc': v.kleur } : {}), '--vdur': `${ms}ms` } as CSSProperties}
      aria-live="polite"
    >
      {/* Drie lagen die samen de klap geven: een flits op het moment zelf, een schokgolf die
          uitdijt in de clubkleur, en stralen die er traag doorheen draaien. */}
      <div className="gk-viering-flits" aria-hidden />
      <div className="gk-viering-golf" aria-hidden />
      <div className="gk-viering-burst" aria-hidden />
      <div className="gk-viering-inhoud">
        {raket ? (
          /* +2: raket vertrekt bij de scorende club, vliegt in een boog over en ontploft op
             het logo van de tegenstander. */
          <div className={`gk-raketbaan${naarLinks ? ' naarlinks' : ''}`}>
            {zijde(links, naarLinks, 'home')}
            <span className="gk-raket" aria-hidden>🚀</span>
            {zijde(rechts, !naarLinks, 'away')}
          </div>
        ) : (
          /* +1: het logo van de scorende club groeit én draait rond. */
          <span className="gk-viering-logo draai">
            <TeamLogo name={v.team} logoUrl={v.logo} logoFit={v.fit} side="home" size="clamp(140px, 34vmin, 380px)" ringColor={v.kleur ?? undefined} />
          </span>
        )}
        <span className="gk-viering-punten">+{v.punten}</span>
        <span className="gk-viering-titel">DOELPUNT!</span>
        <span className="gk-viering-team">{v.team}</span>
        <span className="gk-viering-reeks">{v.reeks}</span>
      </div>
    </div>
  )
}

// ── Fotoshow: een supporter stuurde een foto in ────────────────────────────────────────────────
// "📸 OH OHHH… hier komt 'm!" met een 3-2-1-aftelklok waar de hele kantine luidop mee aftelt,
// dan popt de foto als polaroid in beeld en lost weer op. De foto laadt alvast tijdens het
// aftellen; lukt het laden niet, dan slaan we de onthulling stilletjes over.
function FotoShow({ id, naam, klaar }: { id: number; naam: string; klaar: () => void }) {
  const [tel, setTel] = useState(FOTO_TEL_VANAF)
  const url = `/api/tornooi-groep/foto/${id}?naam=${encodeURIComponent(naam)}`
  const [geladen, setGeladen] = useState<boolean | null>(null)

  // Voorladen tijdens het aftellen — de onthulling mag niet haperen.
  useEffect(() => {
    const img = new Image()
    img.onload = () => setGeladen(true)
    img.onerror = () => setGeladen(false)
    img.src = url
    // eslint-disable-next-line
  }, [id])

  useEffect(() => {
    setTel(FOTO_TEL_VANAF)
    // Blijft op 0 staan (niet verder de min in): zo triggert het toon-effect precies één keer.
    const iv = setInterval(() => setTel((t) => Math.max(0, t - 1)), 1000)
    return () => clearInterval(iv)
  }, [id])

  // Aftellen voorbij: foto tonen (of stil overslaan als ze niet laadde) en daarna opruimen.
  useEffect(() => {
    if (tel > 0) return
    if (geladen === false) {
      klaar()
      return
    }
    const t = setTimeout(klaar, FOTO_TOON_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line
  }, [tel, geladen])

  return (
    <div className="gk-fotoshow" aria-live="polite">
      {tel > 0 ? (
        <div className="gk-fs-tease">
          <span className="gk-fs-titel">📸 OH OHHH…</span>
          <span className="gk-fs-sub">hier komt ’m!</span>
          {/* key per cijfer: elke seconde popt het cijfer opnieuw — mee aftellen dus. */}
          <span key={tel} className="gk-fs-tel">
            <i className="gk-fs-ring" aria-hidden />
            {tel}
          </span>
        </div>
      ) : (
        <div className="gk-fs-reveal">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Supportersfoto van de dag" onError={klaar} />
          <span className="gk-fs-onder">📷 Supportersfoto van de dag</span>
        </div>
      )}
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
  // Fotoshow-wachtrij: nieuwe inzendingen komen één voor één met aftelklok in beeld.
  const [fotoRij, setFotoRij] = useState<number[]>([])
  const fotoGezien = useRef<Set<number>>(new Set())
  // Vorige standen per wedstrijd — het verschil tussen twee polls IS het doelpunt.
  const vorige = useRef<Map<number, { home: number; away: number }>>(new Map())
  const vieringSeq = useRef(0)
  const vieringTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Eerste momentopname "leren" zonder te vieren (anders barst het scherm los bij het openen).
  useEffect(() => {
    for (const m of initial.matches) vorige.current.set(m.id, { ...m.score })
    for (const f of initial.fotos ?? []) fotoGezien.current.add(f.id)
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
              const tegen = kant === 'home' ? m.away : m.home
              if (team) {
                const punten = kant === 'home' ? m.score.home - oud.home : m.score.away - oud.away
                const key = ++vieringSeq.current
                setViering({
                  key,
                  kant,
                  team,
                  punten,
                  kleur: d.kleuren[team] ?? null,
                  logo: d.logos[team] ?? null,
                  fit: d.fits[team] ?? null,
                  reeks: m.reeksNaam,
                  tegen: tegen ?? null,
                  tegenLogo: tegen ? d.logos[tegen] ?? null : null,
                  tegenFit: tegen ? d.fits[tegen] ?? null : null,
                  tegenKleur: tegen ? d.kleuren[tegen] ?? null : null,
                })
                if (vieringTimer.current) clearTimeout(vieringTimer.current)
                const duur = vieringDuur({ punten, tegen: tegen ?? null })
                vieringTimer.current = setTimeout(() => setViering((v) => (v && v.key === key ? null : v)), duur)
              }
            }
          }
          vorige.current.set(m.id, { ...m.score })
        }
        // Nieuwe supportersfoto('s)? In de rij voor de fotoshow (oudste eerst).
        for (const f of [...(d.fotos ?? [])].reverse()) {
          if (fotoGezien.current.has(f.id)) continue
          fotoGezien.current.add(f.id)
          setFotoRij((rij) => [...rij, f.id])
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
  // Al gespeeld: enkel echte wedstrijden (een bye heeft geen tegenstander), nieuwste eerst.
  // Dit vult de stille momenten tussen twee wedstrijden — dan hangt er nu iets te zien.
  const gespeeld = useMemo(() => {
    const done = data.matches.filter((m) => m.status === 'finished' && m.home && m.away)
    return done.sort((a, b) => {
      const ta = a.plannedAt ? new Date(a.plannedAt).getTime() : 0
      const tb = b.plannedAt ? new Date(b.plannedAt).getTime() : 0
      return tb - ta || b.id - a.id
    })
  }, [data.matches])

  const cols = kolommenVoor(live.length)
  const kampioenen = data.reeksen.filter((r) => r.champion)

  // Look van de organiserende club: haar kleuren dragen het scherm (val terug op de huisstijl).
  const stijl = {
    ...(data.host?.colorPrimary ? { '--gk-a': data.host.colorPrimary } : {}),
    ...(data.host?.colorSecondary ? { '--gk-b': data.host.colorSecondary } : {}),
  } as CSSProperties

  return (
    <div className="gk-scherm" style={stijl}>
      {viering && <VieringOverlay key={viering.key} v={viering} ms={vieringDuur(viering)} />}
      {fotoRij.length > 0 && (
        <FotoShow key={fotoRij[0]} id={fotoRij[0]} naam={naam} klaar={() => setFotoRij((rij) => rij.slice(1))} />
      )}
      {/* De kop draait om het evenement: hostlogo en naam staan groot en exact gecentreerd,
          met de merknaam er discreet boven. Tellers horen hier niet thuis — de kantine wil de
          naam van de dag zien. De fullscreen-knop zweeft rechts en vaagt weg zodra hij actief
          is (op de tv verdwijnt hij helemaal uit beeld). */}
      <header className="gk-kop">
        <span className="gk-titel">
          {data.host?.logoUrl && (
            <img className="gk-hostlogo" src={data.host.logoUrl} alt={data.host.name || 'Organiserende club'} />
          )}
          <span className="gk-titel-tekst">
            <span className="gk-merk">Krachtbal Live</span>
            <span className="gk-evenement">{data.naam}</span>
          </span>
        </span>
        <button
          type="button"
          className={`gk-fs-btn${fullscreen ? ' actief' : ''}`}
          onClick={wisselFullscreen}
          title={fullscreen ? 'Volledig scherm verlaten' : 'Volledig scherm'}
        >
          {fullscreen ? '✕' : '⛶ Volledig scherm'}
        </button>
      </header>

      {live.length > 0 ? (
        <div className="gk-raster" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {live.map((m) => (
            <LiveBord key={m.id} m={m} groot={live.length === 1} logos={data.logos} kleuren={data.kleuren} fits={data.fits} />
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
                {/* Zelfde opbouw als een uitslagkaart hieronder: reeks en uur centraal bovenaan,
                    daaronder thuis links, uit rechts en het midden exact in het midden. Zo staan
                    de logo's, de namen en het VS/de score van beide blokken op dezelfde lijnen. */}
                <span className="gk-komend-kop">
                  <span className="gk-komend-uur">{m.plannedAt ? tijdBE(m.plannedAt) : '—'}</span>
                  <span className="gk-komend-reeks">{m.reeksNaam}</span>
                </span>
                <span className="gk-komend-affiche">
                  <span className="gk-komend-ploeg">
                    {m.home && (
                      <TeamLogo name={m.home} logoUrl={data.logos[m.home] ?? null} logoFit={data.fits[m.home] ?? null} side="home" size="1.9em" ringColor={data.kleuren[m.home]} />
                    )}
                    <span className="gk-komend-team">{m.home}</span>
                  </span>
                  <span className="gk-komend-vs">VS</span>
                  <span className="gk-komend-ploeg rechts">
                    <span className="gk-komend-team">{m.away}</span>
                    {m.away && (
                      <TeamLogo name={m.away} logoUrl={data.logos[m.away] ?? null} logoFit={data.fits[m.away] ?? null} side="away" size="1.9em" ringColor={data.kleuren[m.away]} />
                    )}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {/* Wat er vandaag al gespeeld is — tussen twee wedstrijden door blijft het scherm zo
              leven. Maximaal negen, anders wordt het op afstand onleesbaar. */}
          <Uitslagen gespeeld={gespeeld.slice(0, 9)} logos={data.logos} kleuren={data.kleuren} fits={data.fits} titel="Al gespeeld" />
        </div>
      ) : (
        <div className="gk-pauze klaar">
          <p className="gk-aftel-lbl">🏆 Alle wedstrijden zijn gespeeld</p>
          {kampioenen.length > 0 && (
            <ul className="gk-kampioenen">
              {kampioenen.map((r) => (
                <li key={r.id}>
                  <span className="gk-kamp-reeks">{r.naam}</span>
                  <span className="gk-kamp-naam">🏆 {r.champion}</span>
                </li>
              ))}
            </ul>
          )}
          <Uitslagen gespeeld={gespeeld.slice(0, 9)} logos={data.logos} kleuren={data.kleuren} fits={data.fits} titel="Alle uitslagen" />
        </div>
      )}

      {/* De balk onderaan draait de uitslagen van de dag voorbij — dat is wat mensen willen zien
          terwijl er gespeeld wordt, en het leest sneller dan een programma. Zolang er nog niets
          gespeeld is toont ze het programma, zodat de balk nooit leeg staat. Bij een handvol
          items staat ze stil (niets om te scrollen); daarboven loopt ze naadloos in een lus. */}
      {gespeeld.length > 0 ? (
        <UitslagTicker gespeeld={gespeeld} logos={data.logos} kleuren={data.kleuren} fits={data.fits} />
      ) : (
        komend.length > 0 && <KomendTicker komend={komend} logos={data.logos} kleuren={data.kleuren} fits={data.fits} />
      )}
    </div>
  )
}

// Al gespeeld: tussen twee wedstrijden door is dít wat de kantine wil zien. Nieuwste bovenaan,
// de winnaar opgelicht, en de reeks erbij zodat je weet waar een uitslag bij hoort. Het raster
// schaalt mee met het aantal — bij één uitslag groot, bij een volle dag compacter.
function Uitslagen({
  gespeeld,
  logos,
  kleuren,
  fits,
  titel,
}: {
  gespeeld: GroepMatch[]
  logos: Record<string, string>
  kleuren: Record<string, string>
  fits: Record<string, LogoFit>
  titel: string
}) {
  if (gespeeld.length === 0) return null
  const kolommen = gespeeld.length <= 2 ? 1 : gespeeld.length <= 6 ? 2 : 3
  return (
    <div className={`gk-uitslagen k${kolommen}`}>
      <p className="gk-uitslagen-lbl">{titel}</p>
      <ul className="gk-uitslagen-lijst">
        {gespeeld.map((m) => {
          const winnaar = m.winner
          // Gelijkspel zonder aangeduide winnaar: dan staan beide ploegen even fel — anders lijkt
          // het alsof er niemand gewonnen heeft én niemand meegedaan.
          const gelijk = winnaar == null
          return (
            <li
              key={m.id}
              className={`gk-uit${gelijk ? ' gelijk' : ''}`}
              style={{
                ...(m.home && kleuren[m.home] ? { '--ka': kleuren[m.home] } : {}),
                ...(m.away && kleuren[m.away] ? { '--kb': kleuren[m.away] } : {}),
              } as CSSProperties}
            >
              <span className="gk-uit-reeks">{m.reeksNaam}</span>
              <span className="gk-uit-rij">
                <span className={`gk-uit-ploeg${winnaar === 'home' ? ' wint' : ''}`}>
                  {m.home && (
                    <TeamLogo name={m.home} logoUrl={logos[m.home] ?? null} logoFit={fits[m.home] ?? null} side="home" size="1.7em" ringColor={m.home ? kleuren[m.home] : undefined} />
                  )}
                  <span className="gk-uit-naam">{m.home}</span>
                </span>
                <span className="gk-uit-score">
                  {m.score.home}<span className="gk-uit-streep">–</span>{m.score.away}
                </span>
                <span className={`gk-uit-ploeg rechts${winnaar === 'away' ? ' wint' : ''}`}>
                  <span className="gk-uit-naam">{m.away}</span>
                  {m.away && (
                    <TeamLogo name={m.away} logoUrl={logos[m.away] ?? null} logoFit={fits[m.away] ?? null} side="away" size="1.7em" ringColor={m.away ? kleuren[m.away] : undefined} />
                  )}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function UitslagTicker({
  gespeeld,
  logos,
  kleuren,
  fits,
}: {
  gespeeld: GroepMatch[]
  logos: Record<string, string>
  kleuren: Record<string, string>
  fits: Record<string, LogoFit>
}) {
  const loop = gespeeld.length >= 4
  const duur = `${Math.max(20, gespeeld.length * 5)}s`
  const helft = (verborgen: boolean) => (
    <span className="gk-ticker-helft" aria-hidden={verborgen}>
      {gespeeld.map((m) => (
        <span key={m.id} className="gk-tick">
          {/* Logo – uitslag – logo, met de reeks er exact centraal onder. De winnaar staat vol,
              de verliezer gedempt: zo lees je de uitslag zonder de cijfers te ontcijferen. */}
          <span className="gk-tick-blok">
            <span className="gk-tick-affiche">
              <span className={`gk-tick-kant${m.winner === 'home' ? ' wint' : ''}`}>
                {m.home && <TeamLogo name={m.home} logoUrl={logos[m.home] ?? null} logoFit={fits[m.home] ?? null} side="home" size="1.7em" ringColor={m.home ? kleuren[m.home] : undefined} />}
              </span>
              <span className="gk-tick-uitslag">{m.score.home}<span className="gk-tick-streep">–</span>{m.score.away}</span>
              <span className={`gk-tick-kant${m.winner === 'away' ? ' wint' : ''}`}>
                {m.away && <TeamLogo name={m.away} logoUrl={logos[m.away] ?? null} logoFit={fits[m.away] ?? null} side="away" size="1.7em" ringColor={m.away ? kleuren[m.away] : undefined} />}
              </span>
            </span>
            <span className="gk-tick-reeks">{m.reeksNaam}</span>
          </span>
        </span>
      ))}
    </span>
  )
  return (
    <div className="gk-ticker uitslagen">
      <div className={`gk-ticker-strook${loop ? ' loop' : ''}`} style={{ '--dur': duur } as CSSProperties}>
        {helft(false)}
        {loop && helft(true)}
      </div>
    </div>
  )
}

function KomendTicker({ komend, logos, kleuren, fits }: { komend: GroepMatch[]; logos: Record<string, string>; kleuren: Record<string, string>; fits: Record<string, LogoFit> }) {
  const loop = komend.length >= 4
  // Snelheid schaalt met de lengte van de lijst: elke wedstrijd krijgt ± 5 s in beeld.
  const duur = `${Math.max(20, komend.length * 5)}s`
  const helft = (verborgen: boolean) => (
    <span className="gk-ticker-helft" aria-hidden={verborgen}>
      {komend.map((m) => (
        <span key={m.id} className="gk-tick">
          {/* Logo-blok met de reeksnaam er exact centraal onder; het uur staat ernaast zodat
              het de centrering van de reeks niet scheeftrekt. */}
          <span className="gk-tick-blok">
            <span className="gk-tick-affiche">
              {m.home && <TeamLogo name={m.home} logoUrl={logos[m.home] ?? null} logoFit={fits[m.home] ?? null} side="home" size="1.7em" ringColor={m.home ? kleuren[m.home] : undefined} />}
              <span className="gk-tick-vs">–</span>
              {m.away && <TeamLogo name={m.away} logoUrl={logos[m.away] ?? null} logoFit={fits[m.away] ?? null} side="away" size="1.7em" ringColor={m.away ? kleuren[m.away] : undefined} />}
            </span>
            <span className="gk-tick-reeks">{m.reeksNaam}</span>
          </span>
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
