'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { CastKnop } from '@/components/CastKnop'
import { ReclameBalk } from '@/components/ReclameBalk'
import { SchermModus } from '@/components/SchermModus'
import { TeamLogo } from '@/components/TeamLogo'
import { ReclameOverlay } from '@/components/ReclameOverlay'
import type { Ad } from '@/lib/ads'
import type { ClubColors } from '@/lib/club-colors'
import { Tile, type KantineMatch } from './KantineBoard'

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
  const [loaded, setLoaded] = useState(false)
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
    const load = async () => {
      try {
        const r = await fetch(endpoint, { cache: 'no-store' })
        if (!r.ok) return
        const d = (await r.json()) as { matches?: KantineMatch[]; ads?: Ad[]; stijl?: KantineStijl }
        if (active) {
          setMatches(d.matches ?? [])
          setAds(d.ads ?? [])
          setStijl(d.stijl ?? null)
          setLoaded(true)
        }
      } catch {
        /* netwerkfout — volgende poll probeert opnieuw */
      }
    }
    void load()
    const t = setInterval(load, 12000)
    return () => {
      active = false
      clearInterval(t)
    }
  }, [endpoint])

  // Toon de gespeelde wedstrijden (live + afgelopen): een afgelopen wedstrijd blijft staan, en
  // zodra een geplande wedstrijd start komt ze er vanzelf bij. Zolang er nog niets begonnen is,
  // tonen we de geplande wedstrijden (anders zou het scherm leeg zijn vóór de aftrap).
  const played = matches.filter((m) => m.status !== 'scheduled')
  const visible = played.length > 0 ? played : matches
  const layout = layoutFor(visible.length)
  // Begrens de kolommen op wat de schermbreedte aankan.
  const cols = Math.min(layout.cols, maxColsForWidth(vw))

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
  useEffect(() => {
    const el = vensterRef.current
    if (!el) return
    const meet = () => setVensterH(el.clientHeight)
    meet()
    const ro = new ResizeObserver(meet)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Onder deze hoogte is een bord van vijf meter niet meer te lezen — dan liever bladeren.
  const MIN_BORD_H = 168
  const GAT = 14
  const rijenPerBlad = Math.max(1, Math.floor((vensterH + GAT) / (MIN_BORD_H + GAT)) || 1)
  const perBlad = Math.max(1, cols * rijenPerBlad)
  const bladen = Math.max(1, Math.ceil(visible.length / perBlad))
  // Exacte rijhoogte: `rijenPerBlad` rijen plus hun tussenruimtes vullen het venster precies.
  const rijH = vensterH > 0 ? (vensterH - (rijenPerBlad - 1) * GAT) / rijenPerBlad : 0

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
  const dagGedaan = visible.length > 0 && visible.every((m) => m.status === 'finished')

  // De balk onderaan: wat er nog komt. Alles wat vandaag of deze week nog gepland staat en niet
  // al als bord op het scherm hangt — anders rolt dezelfde wedstrijd twee keer voorbij.
  const opBord = new Set(visible.map((m) => m.id))
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
      {loaded && matches.length === 0 ? (
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
        <>
          <div className="kt-grid-venster" ref={vensterRef}>
            <div
              className="kt-grid-screen"
              style={{
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                // Exacte rijhoogte zolang we gemeten hebben; daarvóór de oude 1fr-verdeling, zodat
                // het eerste frame niet leeg is.
                ...(rijH > 0 ? { gridAutoRows: `${rijH}px` } : {}),
                // Eén blad opzij schuiven = de vensterhoogte plus de tussenruimte eronder.
                transform: rijH > 0 ? `translateY(-${huidigBlad * (vensterH + GAT)}px)` : undefined,
              }}
            >
              {visible.map((m) => (
                <Tile key={m.id} match={m} fontSize={fontSize} logoSize={logoSize} />
              ))}
            </div>
          </div>
          {/* Bolletjes: zonder die hint lijkt een blad met acht borden gewoon álles wat er is.
              Ze staan ONDER het venster, niet erin — anders liggen ze op de onderste rij én
              vervalsen ze de gemeten hoogte waarmee de rijen berekend worden. */}
          {bladen > 1 && (
            <div className="kt-bladen" aria-hidden>
              {Array.from({ length: bladen }, (_, i) => (
                <span key={i} className={`kt-blad-punt${i === huidigBlad ? ' on' : ''}`} />
              ))}
            </div>
          )}
        </>
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
