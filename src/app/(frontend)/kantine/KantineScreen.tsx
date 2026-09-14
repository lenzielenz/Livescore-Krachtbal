'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { CastKnop } from '@/components/CastKnop'
import { ReclameBalk } from '@/components/ReclameBalk'
import { SchermModus } from '@/components/SchermModus'
import { TeamLogo } from '@/components/TeamLogo'
import { ReclameOverlay } from '@/components/ReclameOverlay'
import type { Ad } from '@/lib/ads'
import { bladIndeling, BLAD_GAT } from '@/lib/kantine-bladeren'
import type { KantineLive } from '@/lib/kantine-channel'
import type { ClubColors } from '@/lib/club-colors'
import { useLiveStream } from '@/lib/use-live-stream'
import { ResultTile, Tile, type KantineMatch } from './KantineBoard'

/** Clubstijl van de eigenaar van dit scherm: de tv van de club hoort eruit te zien als de club. */
export type KantineStijl = { club: string; kleuren: ClubColors | null } | null

// Layout die meeschaalt met het aantal getoonde borden: weinig wedstrijden = grote vakken die
// het scherm vullen, meer wedstrijden = meer kolommen en kleinere vakken.
function layoutFor(n: number): { cols: number; fontSize: number; logoSize: string } {
  if (n <= 1) return { cols: 1, fontSize: 34, logoSize: 'clamp(130px, 22vmin, 300px)' }
  if (n <= 2) return { cols: 2, fontSize: 28, logoSize: 'clamp(100px, 16vmin, 220px)' }
  if (n <= 4) return { cols: 2, fontSize: 23, logoSize: 'clamp(80px, 13vmin, 180px)' }
  if (n <= 6) return { cols: 3, fontSize: 19, logoSize: 'clamp(62px, 10vmin, 132px)' }
  if (n <= 9) return { cols: 3, fontSize: 17, logoSize: 'clamp(54px, 8.5vmin, 112px)' }
  if (n <= 12) return { cols: 4, fontSize: 15, logoSize: 'clamp(44px, 6.5vmin, 92px)' }
  return { cols: 5, fontSize: 13, logoSize: 'clamp(36px, 5.5vmin, 76px)' }
}

// Het eigenlijke kantinescherm (kantine-tv): toont de centraal gekozen wedstrijden als live
// borden. Pollt de selectie elke 12s zodat wijzigingen op een ander toestel vanzelf doorkomen;
// de scores binnen elk bord lopen live via SSE. De layout past zich aan aan het aantal borden.
// Maximaal aantal kolommen dat een schermbreedte comfortabel aankan (tablet/telefoon meegerekend).
function maxColsForWidth(w: number): number {
  if (w < 560) return 1
  if (w < 900) return 2
  if (w < 1300) return 3
  if (w < 1700) return 4
  return 5
}

export function KantineScreen({
  endpoint = '/api/kantine',
  editable = true,
  title,
  castPad = '/kantine/scherm',
}: {
  /** Bron van de wedstrijden (default: de centrale selectie). */
  endpoint?: string
  /** Toon de "Aanpassen"-link + kies-CTA (enkel op de bedienbare versie). */
  editable?: boolean
  /** Titel/onderschrift, bv. de clubnaam op een vaste club-link. */
  title?: string
  /** Welk pad de Chromecast moet laden. Default: het gedeelde scherm. Een persoonlijk scherm
      geeft hier zijn eigen pad mee, anders cast de knop iemand anders zijn wedstrijden. */
  castPad?: string
} = {}) {
  const [matches, setMatches] = useState<KantineMatch[]>([])
  const [ads, setAds] = useState<Ad[]>([])
  const [stijl, setStijl] = useState<KantineStijl>(null)
  // Drie standen i.p.v. één "loaded"-vlag. Zolang het antwoord er niet is, stond hier een leeg
  // raster: een volledig wit scherm, zonder dat iemand aan de tv kon zien of er iets aan het
  // gebeuren was. En mislukte de oproep (de route antwoordt bij eender welke fout met een 500),
  // dan bleef het daar voorgoed staan — de poll draaide door, maar het scherm zei niets.
  const [stand, setStand] = useState<'laden' | 'klaar' | 'fout'>('laden')
  // Viewport-breedte volgen zodat het raster niet 5 kolommen op een tablet propt (AUDIT §1).
  const [vw, setVw] = useState(1920)

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Volledig scherm voor de kantine-tv: geen browserbalk, alleen het bord. Zelfde knop als op het
  // tornooischerm, zodat wie beide bedient niet hoeft te zoeken.
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

  useEffect(() => {
    let active = true
    // Loopt de vorige ophaling nog? Dan deze overslaan. Zonder deze rem stapelen trage verzoeken
    // op en vuren ze later samen een rebuild af — precies wanneer het al moeizaam ging.
    let bezig = false
    // Een hapering tijdens een latere poll mag een werkend scherm niet leegvegen: enkel wanneer we
    // nog nooit iets binnenkregen, tonen we de foutmelding. De poll blijft hoe dan ook draaien.
    const noteerFout = () => {
      if (active) setStand((s) => (s === 'klaar' ? s : 'fout'))
    }
    const load = async () => {
      if (bezig) return
      bezig = true
      try {
        const r = await fetch(endpoint, { cache: 'no-store' })
        if (!r.ok) return noteerFout()
        const d = (await r.json()) as { matches?: KantineMatch[]; ads?: Ad[]; stijl?: KantineStijl }
        if (active) {
          setMatches(d.matches ?? [])
          // Enkel vervangen als de reclame écht veranderde. Elke ophaling geeft een verse array,
          // en die nieuwe identiteit alleen al herstartte de planning in ReclameOverlay — waar de
          // wachttijd tot de volgende reclame acht à twaalf minuten is. Om de twaalf seconden
          // opnieuw plannen betekende: nooit één te zien krijgen.
          setAds((vorig) => (JSON.stringify(vorig) === JSON.stringify(d.ads ?? []) ? vorig : (d.ads ?? [])))
          setStijl(d.stijl ?? null)
          setStand('klaar')
        }
      } catch {
        // netwerkfout — volgende poll probeert opnieuw
        noteerFout()
      } finally {
        bezig = false
      }
    }
    void load()
    const t = setInterval(load, 12000)
    return () => {
      active = false
      clearInterval(t)
    }
  }, [endpoint])

  // Eén liveverbinding voor de relevante borden. Voor de aftrap volgen we de geplande
  // wedstrijden; zodra de dag begonnen is volstaan live- en eindstanden.
  const [live, setLive] = useState<Record<number, KantineLive>>({})
  const streamMatches = matches.some((m) => m.status !== 'scheduled')
    ? matches.filter((m) => m.status !== 'scheduled')
    : matches
  const idsSleutel = streamMatches.map((m) => m.id).sort((a, b) => a - b).join(',')
  useLiveStream<KantineLive[]>(
    idsSleutel ? `/api/kantine/live/stream?ids=${idsSleutel}` : null,
    (frame) => {
      const kaart: Record<number, KantineLive> = {}
      for (const r of frame) kaart[r.id] = r
      setLive(kaart)
    },
  )

  const statusVan = (m: KantineMatch) => live[m.id]?.status ?? m.status
  const liveMatches = matches.filter((m) => statusVan(m) === 'live')
  const finishedMatches = matches.filter((m) => statusVan(m) === 'finished')
  const played = [...liveMatches, ...finishedMatches]
  // Livewedstrijden zijn de hoofdinhoud. Voor de eerste aftrap tonen we het programma; na de
  // laatste wedstrijd blijft alleen de compacte uitslagenwand over.
  const visible = liveMatches.length > 0 ? liveMatches : played.length === 0 ? matches : []
  const layout = layoutFor(visible.length)
  const cols = Math.min(layout.cols, maxColsForWidth(vw))
  const resultsPerPage = vw < 700 ? 2 : vw < 1300 ? 3 : 4

  // ── Bladeren in plaats van proppen ────────────────────────────────────────────────────────
  // Het raster stond op `grid-auto-rows: 1fr` in een venster met overflow:hidden. Een rij kan
  // niet kleiner dan haar inhoud, dus zodra er veel wedstrijden op de dag staan werd het raster
  // hoger dan het scherm en viel de onderste rij er half af — en omdat het lettertype met het
  // TOTAAL meeschaalde, stonden de kaarten die je wél zag ook nog eens te klein.
  //
  // Nu meten we het venster, bepalen we hoeveel rijen er écht in passen, en schuiven we per blad
  // door. Elke rij krijgt een exacte hoogte, dus er wordt nooit meer iets afgekapt.
  const vensterRef = useRef<HTMLDivElement>(null)
  const [vensterH, setVensterH] = useState(0)
  // Zonder wedstrijden staat er een tekst in de plaats van het raster. Het venster verdwijnt dan
  // uit de boom, dus de meting moet opnieuw opgezet worden zodra het terugkomt — een tv die dagen
  // aan één stuk draait gaat bij middernacht door die lege staat, en met een observer die op de
  // losgekoppelde node blijft hangen zou vensterH daarna op 0 blijven staan (en knipt het raster
  // weer af, precies wat we hier oplossen). Hetzelfde geldt voor de laad- en foutmelding.
  const leegScherm = stand === 'klaar' && matches.length === 0
  const laadScherm = stand === 'laden'
  const foutScherm = stand === 'fout' && matches.length === 0
  const toonRaster = !leegScherm && !laadScherm && !foutScherm
  useEffect(() => {
    const el = vensterRef.current
    if (!el) return
    const meet = () => setVensterH(el.clientHeight)
    meet()
    const ro = new ResizeObserver(meet)
    ro.observe(el)
    return () => ro.disconnect()
  }, [toonRaster, visible.length])

  const { perBlad, bladen, rijH } = bladIndeling({ aantal: visible.length, cols, vensterH })

  const [blad, setBlad] = useState(0)
  useEffect(() => {
    if (bladen <= 1) {
      setBlad(0)
      return
    }
    // Lang genoeg om een blad rustig te lezen van op afstand.
    const t = setInterval(() => setBlad((b) => (b + 1) % bladen), 9000)
    return () => clearInterval(t)
  }, [bladen])
  // Na een herberekening (nieuwe wedstrijd, ander formaat) kan het huidige blad wegvallen.
  const huidigBlad = Math.min(blad, bladen - 1)

  // Het lettertype volgt wat er op ÉÉN blad staat, niet het totaal van de dag.
  const bladLayout = layoutFor(Math.min(visible.length, perBlad))
  const fontSize = cols < bladLayout.cols ? Math.round(bladLayout.fontSize * 1.12) : bladLayout.fontSize
  const logoSize = bladLayout.logoSize

  // Aftellen naar de eerstvolgende wedstrijd zolang er niets bezig is — anders staat er een
  // scherm vol geplande borden zonder dat iemand weet hoelang het nog duurt.
  const volgende = played.length === 0
    ? matches
        .filter((m) => m.status === 'scheduled' && m.date)
        .map((m) => ({ m, t: new Date(String(m.date)).getTime() }))
        .filter((x) => Number.isFinite(x.t) && x.t > Date.now())
        .sort((a, b) => a.t - b.t)[0]
    : undefined

  // Alles gespeeld: dan blijven de borden staan als uitslagenbord, met één regel erboven die
  // zegt dat de dag erop zit. Zonder die regel staat er een scherm vol eindstanden zonder dat
  // iemand weet of er nog iets komt.
  const dagGedaan = matches.length > 0 && finishedMatches.length === matches.length

  // De balk onderaan: wat er nog komt. Alles wat vandaag of deze week nog gepland staat en niet
  // al als bord op het scherm hangt — anders rolt dezelfde wedstrijd twee keer voorbij.
  const opBord = new Set(played.map((m) => m.id))
  const komend = matches
    .filter((m) => m.status === 'scheduled' && !opBord.has(m.id))
    .sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')))

  // Achtergrond in de clubkleuren van de eigenaar. Twee brede vegen bovenaan links en rechts,
  // ruim doorschijnend: het bord moet leesbaar blijven van vijf meter.
  const kleurStijl = stijl?.kleuren
    ? ({
        ['--kt-club-1' as string]: stijl.kleuren.primary,
        ['--kt-club-2' as string]: stijl.kleuren.secondary || stijl.kleuren.primary,
      } as React.CSSProperties)
    : undefined

  return (
    <div className={`kt-screen${stijl?.kleuren ? ' clubstijl' : ''}`} style={kleurStijl}>
      {/* Dit component ÍS het kantinescherm — beide plekken waar het gebruikt wordt (/kantine/scherm
          en de vaste clublink) hangen aan een tv. Dus altijd de schermmarkering, die onderaan de
          voettekst van de site weghaalt.

          Dit hing eerst aan `!editable`, en dat was fout: /kantine/scherm gebruikt de standaard
          (editable = true, voor het "‹ Aanpassen"-linkje) en kreeg de voettekst dus wél. Die staat
          ónder een scherm van exact één schermhoogte en duwt er de onderste rand uit — op een tv
          kan niemand daarnaartoe scrollen, dus de uitslagenbalk was er altijd half af. Precies
          dezelfde fout als op het tornooischerm, alleen langs de andere kant binnengekomen: het
          linkje en het tv-zijn hebben niets met elkaar te maken. */}
      <SchermModus />
      {editable && <Link href="/kantine" className="kt-screen-edit">‹ Aanpassen</Link>}
      {/* Rechtstreeks naar de tv. Niet spiegelen: de Chromecast laadt dít scherm zelf en houdt
          zijn eigen live verbinding, zodat het blijft draaien als je je telefoon wegsteekt. */}
      {/* Naam van het scherm en de twee knoppen in één hoek. Ze stonden los van elkaar allebei
          rechtsboven vastgezet en lagen dus over elkaar zodra er een naam was. */}
      <span className={`kt-screen-cast${fullscreen ? ' actief' : ''}`}>
        {(title || stijl?.club) && <span className="kt-screen-title">{title || stijl?.club}</span>}
        {/* Volledig scherm hoort naast de castknop: de twee dingen die je doet zodra de tv aan de
            muur hangt. Vaagt weg zodra hij actief is, zodat er niets op het bord blijft plakken. */}
        <button
          type="button"
          className={`kt-fs-btn${fullscreen ? ' actief' : ''}`}
          onClick={wisselFullscreen}
          title={fullscreen ? 'Volledig scherm verlaten' : 'Volledig scherm'}
        >
          {fullscreen ? '✕' : '⛶ Volledig scherm'}
        </button>
        <CastKnop pad={castPad} sleutel={castPad} />
      </span>
      {/* Af en toe neemt een sponsor het scherm over; de score blijft er doorheen leesbaar. */}
      <ReclameOverlay ads={ads} />
      {dagGedaan && <p className="kt-gedaan">🏁 Alle wedstrijden van vandaag zijn gespeeld</p>}
      {volgende && (
        <div className="kt-aftel">
          <span className="kt-aftel-lbl">Volgende wedstrijd</span>
          <KantineAftel naar={volgende.t} />
          <span className="kt-aftel-affiche">
            {volgende.m.home.name} – {volgende.m.away.name}
          </span>
        </div>
      )}
      {laadScherm ? (
        // Zonder deze melding is een tv die staat te wachten niet te onderscheiden van een tv die
        // stuk is: allebei een wit scherm.
        <div className="kt-screen-empty">
          <p className="kt-laden">Wedstrijden laden…</p>
        </div>
      ) : foutScherm ? (
        <div className="kt-screen-empty">
          <p>Het scherm kan de wedstrijden even niet ophalen.</p>
          <p className="kt-laden">Nieuwe poging binnen enkele seconden…</p>
        </div>
      ) : leegScherm ? (
        <div className="kt-screen-empty">
          {editable ? (
            <>
              <p>Nog geen wedstrijden gekozen voor het kantinescherm.</p>
              <Link href="/kantine" className="kt-screen-btn">Kies wedstrijden →</Link>
            </>
          ) : (
            <p>Vandaag geen wedstrijden{title ? ` voor ${title}` : ''}. Zodra er een wedstrijd is, verschijnt ze hier vanzelf.</p>
          )}
        </div>
      ) : (
        <div className={`kt-stage${liveMatches.length ? ' met-live' : ''}`}>
          {liveMatches.length > 0 && <div className="kt-live-kop"><span /> NU LIVE <b>{liveMatches.length}</b></div>}
          {visible.length > 0 && (
            <>
              <div className="kt-grid-venster" ref={vensterRef}>
                <div
                  className="kt-grid-screen"
                  style={{
                    gridTemplateColumns: `repeat(${cols}, 1fr)`,
                    ...(rijH > 0 ? { gridAutoRows: `${rijH}px` } : {}),
                    transform: rijH > 0 ? `translateY(-${huidigBlad * (vensterH + BLAD_GAT)}px)` : undefined,
                  }}
                >
                  {visible.map((m) => (
                    <Tile key={m.id} match={m} live={live[m.id] ?? null} fontSize={fontSize} logoSize={logoSize} />
                  ))}
                </div>
              </div>
              {bladen > 1 && (
                <div className="kt-bladen" aria-hidden>
                  {Array.from({ length: bladen }, (_, i) => (
                    <span key={i} className={`kt-blad-punt${i === huidigBlad ? ' on' : ''}`} />
                  ))}
                </div>
              )}
            </>
          )}
          {finishedMatches.length > 0 && (
            <UitslagenCarrousel
              matches={finishedMatches}
              live={live}
              perPage={resultsPerPage}
              only={!liveMatches.length}
            />
          )}
        </div>
      )}
      {/* De sponsorbalk onderaan: past zich aan het aantal, het formaat en de kleur van de
          reclames aan (zie components/ReclameBalk.tsx). */}
      <ReclameBalk ads={ads} />
      {/* Helemaal onderaan: wat er nog komt. In de kantine is dat de vraag die het vaakst gesteld
          wordt terwijl er gespeeld wordt — en een rollende balk leest sneller dan een programma. */}
      {komend.length > 0 && <KomendBalk komend={komend} />}
    </div>
  )
}

/**
 * Rollende balk met de komende wedstrijden. Bij een handvol staat ze stil (er valt niets te
 * scrollen); vanaf vier loopt ze naadloos in een lus — dezelfde aanpak als het tornooischerm, met
 * een tweede identieke helft zodat -50% verschuiven exact één ronde is.
 */
function KomendBalk({ komend }: { komend: KantineMatch[] }) {
  const loop = komend.length >= 4
  // Snelheid schaalt met de lengte: elke wedstrijd krijgt ± 5 s in beeld.
  const duur = `${Math.max(20, komend.length * 5)}s`
  const helft = (verborgen: boolean) => (
    <span className="kt-tickerhelft" aria-hidden={verborgen}>
      {komend.map((m) => (
        <span key={m.id} className="kt-tick">
          <span className="kt-tick-blok">
            <span className="kt-tick-affiche">
              <TeamLogo name={m.home.name} logoUrl={m.home.logoUrl} logoFit={m.home.logoFit} side="home" size="1.7em" ringColor={m.home.colors?.primary} />
              <span className="kt-tick-vs">–</span>
              <TeamLogo name={m.away.name} logoUrl={m.away.logoUrl} logoFit={m.away.logoFit} side="away" size="1.7em" ringColor={m.away.colors?.primary} />
            </span>
            <span className="kt-tick-reeks">{m.reeks}</span>
          </span>
          <span className="kt-tick-uur">{m.time}</span>
        </span>
      ))}
    </span>
  )
  return (
    <div className="kt-ticker">
      <div className={`kt-ticker-strook${loop ? ' loop' : ''}`} style={{ ['--dur' as string]: duur } as React.CSSProperties}>
        {helft(false)}
        {loop && helft(true)}
      </div>
    </div>
  )
}

/** Aftellen naar een tijdstip. Start pas ná het mounten — op de server bestaat "nu" niet. */
function KantineAftel({ naar }: { naar: number }) {
  const [nu, setNu] = useState<number | null>(null)
  useEffect(() => {
    setNu(Date.now())
    const t = setInterval(() => setNu(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  if (nu == null) return <span className="kt-aftel-tijd">–:––</span>
  const rest = Math.floor((naar - nu) / 1000)
  if (rest <= 0) return <span className="kt-aftel-tijd">zo meteen</span>
  const u = Math.floor(rest / 3600)
  const m = Math.floor((rest % 3600) / 60)
  const s = rest % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return <span className="kt-aftel-tijd">{u > 0 ? `${u}:${p(m)}:${p(s)}` : `${m}:${p(s)}`}</span>
}


function UitslagenCarrousel({
  matches,
  live,
  perPage,
  only,
}: {
  matches: KantineMatch[]
  live: Record<number, KantineLive>
  perPage: number
  only: boolean
}) {
  const pages = Math.max(1, Math.ceil(matches.length / perPage))
  const [page, setPage] = useState(0)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    setPage(0)
    setLeaving(false)
    if (pages <= 1) return
    let swap: ReturnType<typeof setTimeout> | null = null
    const timer = setInterval(() => {
      setLeaving(true)
      swap = setTimeout(() => {
        setPage((current) => (current + 1) % pages)
        setLeaving(false)
      }, 600)
    }, 8000)
    return () => {
      clearInterval(timer)
      if (swap) clearTimeout(swap)
    }
  }, [pages])

  const safePage = Math.min(page, pages - 1)
  const shown = matches.slice(safePage * perPage, safePage * perPage + perPage)
  return (
    <section className={`kt-results${only ? ' only' : ''}`} aria-label="Afgelopen wedstrijden">
      <header>
        <span>Eindstanden vandaag</span>
        {pages > 1 && <small>{safePage + 1} / {pages}</small>}
      </header>
      <div key={safePage} className={`kt-results-grid${leaving ? ' leaving' : ''}`}>
        {shown.map((match) => <ResultTile key={match.id} match={match} live={live[match.id] ?? null} />)}
      </div>
    </section>
  )
}
