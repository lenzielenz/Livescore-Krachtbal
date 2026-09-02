'use client'

import { useMemo, useRef, useState } from 'react'

import { afgerond, veldCoordinaatVan, veldHoeken, type Punt2 } from '@/lib/luchtfoto'

// Ankerpunten prikken op een luchtfoto.
//
// De kalibratie hangt aan de witte lijnen, en die zijn niet altijd de waarheid: een terrein dat
// geen nette rechthoek is, lijnen die half onder spelers of modder liggen, of een camera die zo
// pant dat ze uit beeld gaan. Dan wil je je kunnen vastzetten aan iets dat blijft staan — de hoek
// van de omheining, een verlichtingspaal, de hoek van de kantine.
//
// Het probleem was nooit het idee maar de coördinaten: van zulke punten kent niemand de
// veldmeters uit het hoofd, en opmeten met een rolmeter is een namiddag werk. Een luchtfoto lost
// dat op. Je duidt de vier hoeken van het veld aan — die ken je, dat is de rechthoek waarvan we
// breedte en lengte al hebben — en daarmee ligt de hele foto vast in meters. Elk punt dat je
// daarna aantikt, ook ver buiten het veld, heeft meteen zijn coördinaten.
//
// De foto blijft in de browser: we hebben er alleen coördinaten uit nodig, geen beeld om te
// bewaren. Dat scheelt een uploadweg, en de foto van iemands terrein hoeft nergens te blijven
// staan.
//
// Bronbeeld: voor Vlaanderen zijn de orthofoto's van Geopunt / Digitaal Vlaanderen open data en
// bruikbaar. Beeldmateriaal van Google mag hier niet voor overgetrokken worden.

export type Anker = { naam: string; x_m: number; y_m: number }

type Klik = { x: number; y: number }

export function Luchtfoto({
  breedte,
  lengte,
  ankers,
  onAnkers,
}: {
  breedte: number
  lengte: number
  ankers: Anker[]
  onAnkers: (a: Anker[]) => void
}) {
  const [foto, setFoto] = useState<string | null>(null)
  const [hoeken, setHoeken] = useState<Klik[]>([])
  const [prikken, setPrikken] = useState<{ klik: Klik; anker: Anker }[]>([])
  const beeldRef = useRef<HTMLImageElement | null>(null)

  const doelen = useMemo(() => veldHoeken(breedte, lengte), [breedte, lengte])
  const klaar = hoeken.length === 4
  const volgendeHoek = klaar ? null : doelen[hoeken.length]

  const hoekparen = useMemo(
    () => (klaar ? hoeken.map((h, i) => ({ foto: h, veld: doelen[i].veld })) : []),
    [klaar, hoeken, doelen],
  )

  /** Klikpositie omrekenen naar de natuurlijke pixels van de foto. */
  const naarFotoPixels = (e: React.MouseEvent<HTMLImageElement>): Klik | null => {
    const el = beeldRef.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return null
    return {
      x: ((e.clientX - r.left) / r.width) * el.naturalWidth,
      y: ((e.clientY - r.top) / r.height) * el.naturalHeight,
    }
  }

  const opKlik = (e: React.MouseEvent<HTMLImageElement>) => {
    const p = naarFotoPixels(e)
    if (!p) return
    if (!klaar) {
      setHoeken((h) => [...h, p])
      return
    }
    const veld = veldCoordinaatVan(p as Punt2, hoekparen)
    if (!veld) return
    const m = afgerond(veld)
    const anker: Anker = { naam: `Anker ${prikken.length + 1}`, x_m: m.x, y_m: m.y }
    setPrikken((lijst) => [...lijst, { klik: p, anker }])
    onAnkers([...ankers, anker])
  }

  const hernoem = (i: number, naam: string) => {
    const nieuw = prikken.map((p, j) => (j === i ? { ...p, anker: { ...p.anker, naam } } : p))
    setPrikken(nieuw)
    onAnkers(nieuw.map((p) => p.anker))
  }

  const wis = (i: number) => {
    const nieuw = prikken.filter((_, j) => j !== i)
    setPrikken(nieuw)
    onAnkers(nieuw.map((p) => p.anker))
  }

  const opnieuw = () => {
    setHoeken([])
    setPrikken([])
    onAnkers([])
  }

  return (
    <section className="lf">
      <h3 className="lf-titel">🛰️ Ankerpunten van een luchtfoto</h3>
      <p className="lf-uitleg">
        Vaste punten <em>buiten</em> de lijnen — de hoek van de omheining, een paal, de hoek van de
        kantine — houden de kalibratie op haar plaats wanneer de veldlijnen tekortschieten. Duid
        eerst de vier hoeken van het veld aan; daarna krijgt elk punt dat je aantikt vanzelf zijn
        coördinaten.
      </p>

      {!foto ? (
        <label className="lf-kies">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) setFoto(URL.createObjectURL(f))
            }}
          />
          <span>Kies een luchtfoto van het terrein</span>
          <em>
            Tip: de orthofoto&apos;s van Geopunt zijn open data en scherp genoeg. De foto blijft op
            dit toestel — er wordt niets geüpload.
          </em>
        </label>
      ) : (
        <>
          <p className="lf-stap">
            {volgendeHoek
              ? `Stap ${hoeken.length + 1} van 4 — klik de hoek: ${volgendeHoek.naam}`
              : 'Klik nu de vaste punten aan die je wil vastleggen.'}
          </p>
          <div className="lf-doek">
            {/* eslint-disable-next-line @next/next/no-img-element -- lokale objectURL, niets te optimaliseren */}
            <img ref={beeldRef} src={foto} alt="Luchtfoto van het terrein" onClick={opKlik} />
            {hoeken.map((h, i) => (
              <span
                key={`hoek-${i}`}
                className="lf-merk hoek"
                style={merkStijl(h, beeldRef.current)}
                title={doelen[i].naam}
              >
                {i + 1}
              </span>
            ))}
            {prikken.map((p, i) => (
              <span key={`anker-${i}`} className="lf-merk anker" style={merkStijl(p.klik, beeldRef.current)}>
                ✚
              </span>
            ))}
          </div>

          {prikken.length > 0 && (
            <ul className="lf-lijst">
              {prikken.map((p, i) => (
                <li key={i}>
                  <input
                    className="lf-naam"
                    value={p.anker.naam}
                    onChange={(e) => hernoem(i, e.target.value)}
                    aria-label="Naam van dit ankerpunt"
                  />
                  <span className="lf-coord">
                    {p.anker.x_m.toFixed(2)} m · {p.anker.y_m.toFixed(2)} m
                  </span>
                  <button type="button" className="lf-weg" onClick={() => wis(i)}>✕</button>
                </li>
              ))}
            </ul>
          )}

          <div className="lf-acties">
            <button type="button" className="an-btn" onClick={opnieuw}>Opnieuw beginnen</button>
            <button type="button" className="an-btn" onClick={() => { setFoto(null); opnieuw() }}>
              Andere foto
            </button>
          </div>
        </>
      )}
    </section>
  )
}

/** Een merkteken op de plek van de klik, in procent van de fotomaat. */
function merkStijl(p: Klik, beeld: HTMLImageElement | null): React.CSSProperties {
  const b = beeld?.naturalWidth || 1
  const h = beeld?.naturalHeight || 1
  return { left: `${(p.x / b) * 100}%`, top: `${(p.y / h) * 100}%` }
}
