'use client'

import { useEffect, useRef, useState } from 'react'

import {
  MAX_ZOOM,
  beeldPerScherm,
  klem,
  naarBeeld,
  naarScherm,
  nauwkeurigheidM,
  nodigeZoom,
  richtwinst,
  vensterStijl,
  type Beeldpunt,
} from '@/lib/kalibratie-zoom'

// Het ijkbeeld waarop je de kruisingen aanwijst — maar dan zo dat je ze écht kunt raken.
//
// Het probleem in cijfers: een HD-video (1920 px breed) staat op een telefoon in een vak van
// zo'n 350 px. Eén schermpixel is dan 5,5 beeldpixels, en een duim raakt het scherm op ~8 px
// nauwkeurig — je zit dus al 44 beeldpixels naast de kruising vóór je scheef mikt. Op dertig
// meter is dat in de diepte metérs op het veld, en die fout kantelt de homografie en dus élke
// meting van de hele wedstrijd. De oude marker maakte het nog erger: een bol van 20 px is
// bréder dan je eigen fout, dus hij kon per constructie niet tonen dat je ernaast zat — en op
// het moment van tikken lag je duim er bovenop.
//
// Drie dingen samen lossen dat op:
//
//   1. Een LOEP op een vaste plek bóven het beeld (niet bij je vinger — daar ligt je hand).
//      Ze toont sterk vergroot wat er rond het dradenkruis zit.
//   2. Het DRADENKRUIS is niet je vinger. Je sleept en het kruis volgt: veeg je groot, dan
//      volgt het één op één (reizen); kruip je, dan gaat het drie keer trager (mikken). Zonder
//      dat laat de loep je wél zien dat je ernaast zit, maar kun je het niet rechtzetten.
//      Loslaten zet het punt op het kruis — niet op je vinger.
//   3. VERGROTEN van het beeld zelf, plus pijltjes voor de laatste beeldpixel.
//
// En een gezet punt is een fijn haarkruis met een gat in het midden: de kruising die je
// aanwees blijft zichtbaar in plaats van onder een bol te verdwijnen.

type Punt = { label: string; x: number; y: number }

const LOEP_ZOOM = 8

/** Binnen hoeveel schermpixels een vinger een al gezet punt vastpakt i.p.v. het volgende te
 *  mikken. Ongeveer de grootte van het haarkruis: raak je het kruis, dan pak je het punt. */
const GRIJP_STRAAL = 16

export function KalibratieDoek({
  frame,
  beeldBreedte,
  beeldHoogte,
  punten,
  volgende,
  meterPerPixel,
  onZet,
  beschrijf,
}: {
  frame: string
  beeldBreedte: number
  beeldHoogte: number
  punten: Punt[]
  /** Het punt dat nu aan de beurt is (null = alles staat er). */
  volgende: string | null
  /** Meter per beeldpixel op het slechtste deel van het veld, uit de vorige kalibratie. */
  meterPerPixel?: number | null
  onZet: (label: string, x: number, y: number) => void
  beschrijf: (label: string) => string
}) {
  const doekRef = useRef<HTMLDivElement | null>(null)
  const vorigeVinger = useRef<{ x: number; y: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [midden, setMidden] = useState<Beeldpunt>({ x: beeldBreedte / 2, y: beeldHoogte / 2 })
  /** Waar het dradenkruis staat terwijl je mikt (beeldpixels), of null als je niets aanwijst. */
  const [richt, setRicht] = useState<Beeldpunt | null>(null)
  const [pannen, setPannen] = useState<{ x: number; y: number; midden: Beeldpunt } | null>(null)
  const [laatste, setLaatste] = useState<Punt | null>(null)
  /** Het label van een al gezet punt dat je vastpakte om het te verplaatsen (null = je mikt
   *  het punt dat aan de beurt is). Zonder dit zette élke nieuwe aanraking het volgende punt —
   *  "ik wil het huidige punt verplaatsen" kon dus alleen via wissen en opnieuw beginnen. */
  const [vastgepakt, setVastgepakt] = useState<string | null>(null)

  const beeld = { breedte: beeldBreedte, hoogte: beeldHoogte }
  // De afmeting van het doek wordt één keer gemeten en bij elke verandering bijgehouden. Ze bij
  // elk gebruik opnieuw opvragen kostte veertien getBoundingClientRect-aanroepen per
  // vingerbeweging (één per gezet punt) — en elke aanroep dwingt de browser tot herberekenen,
  // net terwijl je vloeiend probeert te mikken.
  const [vak, setVak] = useState({ breedte: 0, hoogte: 0 })
  useEffect(() => {
    const el = doekRef.current
    if (!el) return
    const meet = () => {
      const r = el.getBoundingClientRect()
      setVak({ breedte: r.width, hoogte: r.height })
    }
    meet()
    if (typeof ResizeObserver === 'undefined') return
    const waarnemer = new ResizeObserver(meet)
    waarnemer.observe(el)
    return () => waarnemer.disconnect()
  }, [])

  const perScherm = beeldPerScherm(beeld, vak, zoom)
  const fout = nauwkeurigheidM(beeld, vak, zoom, meterPerPixel)
  const scherpGenoeg = perScherm > 0 && perScherm <= 1.2

  const schermpuntVan = (e: React.PointerEvent) => {
    const r = doekRef.current?.getBoundingClientRect()
    if (!r) return null
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const omlaag = (e: React.PointerEvent) => {
    // Rechtermuisknop of shift: het beeld verschuiven in plaats van mikken.
    if (e.button === 2 || e.shiftKey) {
      setPannen({ x: e.clientX, y: e.clientY, midden })
      return
    }
    const s = schermpuntVan(e)
    if (!s) return
    e.currentTarget.setPointerCapture(e.pointerId)
    vorigeVinger.current = { x: e.clientX, y: e.clientY }
    // Landt je vinger op een al gezet haarkruis, dan pak je dát punt vast: het kruis start op
    // het punt zelf (niet op je vinger) en slepen verplaatst het. Zo kan je een net gezet punt
    // meteen rechtzetten in plaats van ongewild het volgende te zetten.
    const beet = punten
      .map((p) => ({ p, s: naarScherm(p, vak, beeld, zoom, midden) }))
      .filter(({ s: q }) => Math.hypot(q.x - s.x, q.y - s.y) <= GRIJP_STRAAL)
      .sort((a, b) => Math.hypot(a.s.x - s.x, a.s.y - s.y) - Math.hypot(b.s.x - s.x, b.s.y - s.y))[0]
    if (beet) {
      setVastgepakt(beet.p.label)
      setRicht({ x: beet.p.x, y: beet.p.y })
      return
    }
    setVastgepakt(null)
    // Bij het neerzetten springt het kruis absoluut naar je vinger: de fijnregeling bouwt pas
    // op tijdens het slepen, zodat het kruis nooit onverwacht ergens anders begint.
    setRicht(naarBeeld(s, vak, beeld, zoom, midden))
  }

  const beweegt = (e: React.PointerEvent) => {
    if (pannen) {
      const perPixel = beeldPerScherm(beeld, vak, zoom)
      setMidden({
        x: klem(pannen.midden.x - (e.clientX - pannen.x) * perPixel, 0, beeldBreedte),
        y: klem(pannen.midden.y - (e.clientY - pannen.y) * perPixel, 0, beeldHoogte),
      })
      return
    }
    if (!richt || !vorigeVinger.current) return
    const dx = e.clientX - vorigeVinger.current.x
    const dy = e.clientY - vorigeVinger.current.y
    vorigeVinger.current = { x: e.clientX, y: e.clientY }
    // Traag bewegen = fijn mikken: het kruis volgt dan maar een derde van je duim.
    const winst = richtwinst(Math.hypot(dx, dy))
    const perPixel = beeldPerScherm(beeld, vak, zoom)
    setRicht({
      x: klem(richt.x + dx * winst * perPixel, 0, beeldBreedte),
      y: klem(richt.y + dy * winst * perPixel, 0, beeldHoogte),
    })
  }

  const omhoog = () => {
    vorigeVinger.current = null
    if (pannen) {
      setPannen(null)
      return
    }
    // Een vastgepakt punt houdt zijn eigen label; anders is dit het punt dat aan de beurt is.
    const label = vastgepakt ?? volgende
    setVastgepakt(null)
    if (!richt || !label) {
      setRicht(null)
      return
    }
    const x = Math.round(richt.x)
    const y = Math.round(richt.y)
    setRicht(null)
    setLaatste({ label, x, y })
    onZet(label, x, y)
  }

  /** Bijstellen met de pijltjes: telkens één beeldpixel, dus fijner dan je ooit kunt tikken. */
  const verschuif = (dx: number, dy: number) => {
    if (!laatste) return
    const x = klem(laatste.x + dx, 0, beeldBreedte)
    const y = klem(laatste.y + dy, 0, beeldHoogte)
    setLaatste({ ...laatste, x, y })
    onZet(laatste.label, x, y)
  }

  const zoomNaar = (nieuw: number) => {
    setZoom(klem(nieuw, 1, MAX_ZOOM))
    if (laatste) setMidden({ x: laatste.x, y: laatste.y })
  }

  // Waar de loep naar kijkt: het dradenkruis terwijl je mikt, anders het laatst gezette punt.
  const loepPunt = richt ?? (laatste ? { x: laatste.x, y: laatste.y } : null)

  return (
    <div className="kd">
      {/* De loep staat vást boven het beeld. Bij je vinger zou je hand ze afdekken — en juist
          op het moment dat je mikt heb je ze nodig. */}
      <div className="kd-loepvak">
        {loepPunt ? (
          <span
            className="kd-loep"
            style={{
              backgroundImage: `url(${frame})`,
              ...vensterStijl(beeld, klem(zoom * LOEP_ZOOM, 4, MAX_ZOOM * 4), loepPunt),
            }}
            aria-hidden
          />
        ) : (
          <span className="kd-loep leeg" aria-hidden />
        )}
        <span className="kd-loeptekst">
          {richt ? (
            <>
              {vastgepakt ? (
                <>Verplaatsen: <strong>{beschrijf(vastgepakt)}</strong></>
              ) : (
                <>Nu: <strong>{Math.round(richt.x)}, {Math.round(richt.y)}</strong></>
              )}
              <em>laat los om te zetten · traag slepen = fijn mikken</em>
            </>
          ) : laatste ? (
            <>
              Laatst gezet: <strong>{beschrijf(laatste.label)}</strong>
              <em>bijstellen kan met de pijltjes</em>
            </>
          ) : (
            <>
              Loep
              <em>houd je vinger op het beeld om te mikken</em>
            </>
          )}
        </span>
      </div>

      <div className="kd-balk">
        <span className="kd-zoomlabel">Vergroting</span>
        {[1, 2, 4, 8].map((z) => (
          <button key={z} type="button" className={`kd-zoom${zoom === z ? ' aan' : ''}`} onClick={() => zoomNaar(z)}>
            {z}×
          </button>
        ))}
        <button
          type="button"
          className="kd-zoom"
          onClick={() => zoomNaar(nodigeZoom(beeld, vak, 1))}
          title="Zoom zo ver in dat één schermpixel één beeldpixel is"
        >
          scherp
        </button>
      </div>

      <div
        ref={doekRef}
        className={`kd-doek${zoom > 2 ? ' pixel' : ''}`}
        // De verhouding komt van het beeld zelf: een telefoonvideo (1080 × 1920) zou met een
        // vaste 16:9 uitgerekt worden en dan klopt élke omgerekende coördinaat niet meer.
        style={{
          aspectRatio: `${beeldBreedte} / ${beeldHoogte}`,
          backgroundImage: `url(${frame})`,
          ...vensterStijl(beeld, zoom, midden),
        }}
        onPointerDown={omlaag}
        onPointerMove={beweegt}
        onPointerUp={omhoog}
        onPointerCancel={() => {
          // Onderbroken gebaar (telefoontje, systeemveeg): liever géén punt dan een punt op de
          // verkeerde plek. Een vastgepakt punt blijft dan gewoon waar het stond.
          vorigeVinger.current = null
          setRicht(null)
          setPannen(null)
          setVastgepakt(null)
        }}
        onContextMenu={(e) => e.preventDefault()}
        role="application"
        aria-label={volgende ? `Wijs aan: ${beschrijf(volgende)}` : 'Alle punten staan er'}
      >
        {punten.map((p) => {
          const s = naarScherm(p, vak, beeld, zoom, midden)
          if (s.x < -14 || s.y < -14 || s.x > vak.breedte + 14 || s.y > vak.hoogte + 14) return null
          return (
            <span
              key={p.label}
              className={`kd-kruis${laatste?.label === p.label ? ' laatste' : ''}`}
              style={{ left: `${s.x}px`, top: `${s.y}px` }}
              title={beschrijf(p.label)}
            />
          )
        })}

        {/* Het dradenkruis waar het punt komt te liggen. */}
        {richt && (
          <span
            className="kd-richt"
            style={(() => {
              const s = naarScherm(richt, vak, beeld, zoom, midden)
              return { left: `${s.x}px`, top: `${s.y}px` }
            })()}
            aria-hidden
          />
        )}
      </div>

      <p className="kd-uitleg">
        {volgende ? (
          <>
            Zet je vinger op het beeld en sleep tot het rode kruis op{' '}
            <strong>{beschrijf(volgende)}</strong> ligt. Loslaten zet het punt. Een punt dat er
            al staat verplaats je door het haarkruis zelf vast te pakken en te slepen.
          </>
        ) : (
          <>Alle veertien punten staan er. Verplaatsen kan: pak een haarkruis vast en sleep.</>
        )}
      </p>

      <p className={`kd-precisie${scherpGenoeg ? ' scherp' : ''}`}>
        {perScherm > 0 && (
          <>
            Eén schermpixel = <strong>{perScherm.toFixed(1)} beeldpixels</strong>
            {fout != null && (
              <> · een tik zit ± {fout < 1 ? `${Math.round(fout * 100)} cm` : `${fout.toFixed(1)} m`} naast</>
            )}
            {!scherpGenoeg && <> — vergroot voor een preciezer punt</>}
          </>
        )}
      </p>

      {laatste && (
        <div className="kd-bijstellen">
          <span>
            Bijstellen: <strong>{beschrijf(laatste.label)}</strong>
          </span>
          <span className="kd-pijlen">
            <button type="button" onClick={() => verschuif(0, -1)} aria-label="één pixel omhoog">↑</button>
            <button type="button" onClick={() => verschuif(-1, 0)} aria-label="één pixel naar links">←</button>
            <button type="button" onClick={() => verschuif(1, 0)} aria-label="één pixel naar rechts">→</button>
            <button type="button" onClick={() => verschuif(0, 1)} aria-label="één pixel omlaag">↓</button>
          </span>
          <span className="kd-coord">
            {laatste.x}, {laatste.y}
          </span>
        </div>
      )}
    </div>
  )
}
