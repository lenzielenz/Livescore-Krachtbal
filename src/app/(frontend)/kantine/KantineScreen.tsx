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
import { komendVandaag, schermVenster, voorbeschouwingKolommen, weekendUitslagen, weekendVoorbeschouwing } from '@/lib/kantine-selectie'
import type { ClubColors } from '@/lib/club-colors'
import { useLiveStream } from '@/lib/use-live-stream'
import { KomendTile, Tile, VoorbeschouwingTile, type KantineMatch } from './KantineBoard'
import { KantineDagverloop } from './KantineDagverloop'
import { GoalCelebrationOverlay, PhotoCelebration, vieringDuur, type KantineFotoInstant, type Viering } from './KantineCelebration'

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

  // Schermvullende doelpunt-viering + fotoshow — zelfde spektakel als op het tornooischerm, maar
  // hier gedetecteerd op het volledige scherm (niet per tegel) zodat elk bord dat scoort of een
  // foto krijgt kort het hele scherm overneemt. Het eerste frame "leert" enkel de stand/foto's die
  // er al waren, anders barst het scherm los zodra de tv 's ochtends aangaat.
  const eersteFrame = useRef(true)
  const gezienGoal = useRef<Map<number, string>>(new Map())
  const gezienFoto = useRef<Set<number>>(new Set())
  const vieringSeq = useRef(0)
  const vieringTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [viering, setViering] = useState<Viering | null>(null)
  const [fotoRij, setFotoRij] = useState<KantineFotoInstant[][]>([])
  useEffect(() => {
    return () => {
      if (vieringTimer.current) clearTimeout(vieringTimer.current)
    }
  }, [])

  useLiveStream<KantineLive[]>(
    idsSleutel ? `/api/kantine/live/stream?ids=${idsSleutel}` : null,
    (frame) => {
      const kaart: Record<number, KantineLive> = {}
      for (const r of frame) kaart[r.id] = r
      setLive(kaart)

      const eerste = eersteFrame.current
      eersteFrame.current = false
      const nieuweFotos: KantineFotoInstant[] = []
      for (const r of frame) {
        const m = matches.find((x) => x.id === r.id)
        if (!m) continue
        if (r.goal) {
          const vorigId = gezienGoal.current.get(r.id)
          if (eerste) {
            gezienGoal.current.set(r.id, r.goal.id)
          } else if (r.goal.id !== vorigId) {
            gezienGoal.current.set(r.id, r.goal.id)
            const kant = r.goal.side
            const tegenKant = kant === 'home' ? 'away' : 'home'
            const team = m[kant]
            const tegen = m[tegenKant]
            const key = ++vieringSeq.current
            const v: Viering = {
              key,
              kant,
              team: team.name,
              punten: r.goal.points,
              kleur: team.colors?.primary ?? null,
              logo: team.logoUrl,
              fit: team.logoFit ?? null,
              reeks: m.reeks,
              tegen: tegen.name,
              tegenLogo: tegen.logoUrl,
              tegenFit: tegen.logoFit ?? null,
              tegenKleur: tegen.colors?.primary ?? null,
            }
            setViering(v)
            if (vieringTimer.current) clearTimeout(vieringTimer.current)
            const duur = vieringDuur(v)
            vieringTimer.current = setTimeout(() => setViering((cur) => (cur && cur.key === key ? null : cur)), duur)
          }
        }
        for (const inst of r.instants) {
          if (gezienFoto.current.has(inst.id)) continue
          gezienFoto.current.add(inst.id)
          if (!eerste) nieuweFotos.push({ id: inst.id, url: inst.url, authorName: inst.authorName })
        }
      }
      if (nieuweFotos.length > 0) setFotoRij((rij) => [...rij, nieuweFotos])
    },
  )

  const statusVan = (m: KantineMatch) => live[m.id]?.status ?? m.status
  // Elke wedstrijd met haar actuele status (live-stream gaat voor op de momentopname van de poll).
  const actueel = matches.map((m) => ({ ...m, status: statusVan(m) }))
  const liveMatches = actueel.filter((m) => m.status === 'live')
  // Het scherm in drie lagen, elk met één taak:
  //  • bovenaan: wat NU live is (groot);
  //  • de middelste strook: enkel wat vandaag nog moet beginnen — reeks, uur en de twee logo's.
  //    Start een wedstrijd, dan schuift ze naar boven; de strook wordt zo vanzelf korter en
  //    verdwijnt zodra er vandaag niets meer komt;
  //  • de balk onderaan: de eindstanden van het speelweekend.
  // Vroeger stonden gespeelde en komende wedstrijden door elkaar in het midden, met de clubnamen
  // erbij; dat was te druk om van ver te lezen.
  const venster = schermVenster()
  const dagEinde = venster.dagEinde
  const visible = komendVandaag(actueel, venster.vandaagStart, dagEinde)
  // Voor het weekend: zolang er nog geen enkele wedstrijd van het komende weekend gestart is,
  // staan ze állemaal tegelijk op het scherm (zie weekendVoorbeschouwing). Geen bladeren: de rijen
  // delen de schermhoogte en letter en logo schalen mee met de gemeten rij.
  const voorbeschouwing = weekendVoorbeschouwing(actueel)
  const vsCols = voorbeschouwingKolommen(voorbeschouwing.length, vw)
  const vsRijen = Math.max(1, Math.ceil(voorbeschouwing.length / vsCols))
  const heeftVoorbeschouwing = voorbeschouwing.length > 0
  const vsRef = useRef<HTMLDivElement>(null)
  const [vsMaat, setVsMaat] = useState({ b: 0, h: 0 })
  useEffect(() => {
    const el = vsRef.current
    if (!el) return
    const meet = () => setVsMaat({ b: el.clientWidth, h: el.clientHeight })
    meet()
    const ro = new ResizeObserver(meet)
    ro.observe(el)
    return () => ro.disconnect()
  }, [heeftVoorbeschouwing])
  const vsRijH = vsMaat.h > 0 ? (vsMaat.h - (vsRijen - 1) * 14) / vsRijen : 200
  const vsKolB = vsMaat.b > 0 ? (vsMaat.b - (vsCols - 1) * 14) / vsCols : 440
  const vsFont = Math.round(Math.max(10, Math.min(vsRijH * 0.085, vsKolB * 0.042, 34)))
  const vsLogo = `${Math.round(Math.max(28, Math.min(vsRijH * 0.4, vsKolB * 0.21)))}px`
  const layout = layoutFor(visible.length)
  const cols = Math.min(layout.cols, maxColsForWidth(vw))
  const featuredLayout = layoutFor(liveMatches.length)
  const featuredCols = Math.min(featuredLayout.cols, maxColsForWidth(vw))

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
  // Zonder clubnamen in de tegel is er plaats voor grotere logo's.
  const logoSize = `calc(${bladLayout.logoSize} * 1.2)`

  // Aftellen naar de eerstvolgende wedstrijd zolang er niets live is — anders staat er een scherm
  // met geplande wedstrijden zonder dat iemand weet hoelang het nog duurt.
  const volgende = liveMatches.length === 0
    ? actueel
        .filter((m) => m.status === 'scheduled' && m.date)
        .map((m) => ({ m, t: new Date(String(m.date)).getTime() }))
        .filter((x) => Number.isFinite(x.t) && x.t > Date.now())
        .sort((a, b) => a.t - b.t)[0]
    : undefined

  // Alles van vandaag gespeeld: één regel bovenaan zegt dat de dag erop zit, zodat een scherm met
  // enkel nog uitslagen niet lijkt te wachten op iets dat niet meer komt. Enkel de wedstrijden van
  // VANDAAG tellen: de uitslagen van gisteren staan ook in de feed (voor de balk onderaan).
  const vandaag = actueel
    .filter((m) => m.date && m.date >= venster.vandaagStart && m.date < dagEinde)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.id - b.id)
  const dagGedaan = vandaag.length > 0 && vandaag.every((m) => m.status === 'finished')

  // De balk onderaan: enkel de eindstanden van het speelweekend (reeks, logo's, score).
  const balkWedstrijden = weekendUitslagen(actueel, venster.uitslagenVanaf)

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
      {viering && <GoalCelebrationOverlay key={viering.key} v={viering} ms={vieringDuur(viering)} />}
      {fotoRij.length > 0 && (
        <PhotoCelebration
          key={fotoRij[0].map((f) => f.id).join(',')}
          fotos={fotoRij[0]}
          klaar={() => setFotoRij((rij) => rij.slice(1))}
        />
      )}
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
      {volgende && !dagGedaan && (
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
      ) : voorbeschouwing.length > 0 ? (
        <div className="kt-vs-venster" ref={vsRef}>
          <div
            className="kt-vs-raster"
            style={{ gridTemplateColumns: `repeat(${vsCols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${vsRijen}, minmax(0, 1fr))` }}
          >
            {voorbeschouwing.map((m) => (
              <VoorbeschouwingTile key={m.id} match={m} fontSize={vsFont} logoSize={vsLogo} />
            ))}
          </div>
        </div>
      ) : (
        dagGedaan ? (
          // Alles van vandaag gespeeld: de dag schermvullend opnieuw afspelen — uitslagen,
          // elke wedstrijd in de schijnwerpers en de supportersfoto's (zie kantine-dagverloop.ts).
          <KantineDagverloop matches={vandaag} live={live} />
        ) : (
        <div className={`kt-stage${liveMatches.length ? ' met-live' : ''}`}>
          {liveMatches.length > 0 && (
            <div className="kt-featured">
              <div className="kt-live-kop"><span /> NU LIVE <b>{liveMatches.length}</b></div>
              <div className="kt-featured-grid" style={{ gridTemplateColumns: `repeat(${featuredCols}, 1fr)` }}>
                {liveMatches.map((m) => (
                  <Tile key={m.id} match={m} live={live[m.id] ?? null} fontSize={featuredLayout.fontSize} logoSize={featuredLayout.logoSize} />
                ))}
              </div>
            </div>
          )}
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
                    <KomendTile key={m.id} match={m} fontSize={fontSize} logoSize={logoSize} />
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
        </div>
        )
      )}
      {/* De sponsorbalk onderaan: past zich aan het aantal, het formaat en de kleur van de
          reclames aan (zie components/ReclameBalk.tsx). */}
      <ReclameBalk ads={ads} />
      {/* De eindstanden van het speelweekend, als rollende balk. */}
      {balkWedstrijden.length > 0 && <Wedstrijdbalk wedstrijden={balkWedstrijden} live={live} />}
    </div>
  )
}

/**
 * Rollende balk met de eindstanden van het speelweekend: reeks, de twee logo's en de score — geen
 * namen, geen uur. Bij een handvol staat ze stil (er valt niets te scrollen); vanaf vier loopt ze
 * naadloos in een lus — dezelfde aanpak als het tornooischerm, met een tweede identieke helft zodat
 * -50% verschuiven exact één ronde is.
 */
function Wedstrijdbalk({
  wedstrijden,
  live,
}: {
  wedstrijden: KantineMatch[]
  live: Record<number, KantineLive>
}) {
  const loop = wedstrijden.length >= 4
  // Snelheid schaalt met de lengte: elke wedstrijd krijgt ± 5 s in beeld.
  const duur = `${Math.max(20, wedstrijden.length * 5)}s`
  const helft = (verborgen: boolean) => (
    <span className="kt-tickerhelft" aria-hidden={verborgen}>
      {wedstrijden.map((m) => {
        const score = live[m.id]?.score ?? m.score
        return (
          <span key={m.id} className="kt-tick afgelopen">
            <span className="kt-tick-blok">
              <span className="kt-tick-affiche">
                <TeamLogo name={m.home.name} logoUrl={m.home.logoUrl} logoFit={m.home.logoFit} side="home" size="1.7em" ringColor={m.home.colors?.primary} />
                <span className="kt-tick-score">{score.home} – {score.away}</span>
                <TeamLogo name={m.away.name} logoUrl={m.away.logoUrl} logoFit={m.away.logoFit} side="away" size="1.7em" ringColor={m.away.colors?.primary} />
              </span>
              <span className="kt-tick-reeks">{m.reeks}</span>
            </span>
          </span>
        )
      })}
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
