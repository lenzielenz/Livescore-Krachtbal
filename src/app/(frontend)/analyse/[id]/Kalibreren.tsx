'use client'

import { useMemo, useRef, useState } from 'react'

import { KalibratieDoek } from './KalibratieDoek'
import {
  ALLE_LABELS,
  CAMERA_POSITIES,
  DWARSLIJNEN,
  ZIJDEN,
  labelVan,
  omschrijving,
  type Zijde,
} from '@/lib/kalibratie-punten'

// Het veld aanwijzen op beelden uit de video: waar liggen de lijnkruisingen? Daarmee kan de
// server elk punt in beeld omrekenen naar meters op het veld.
//
// Meerdere beelden, en dat is geen luxe: staat de camera midden op het veld en pant ze heen
// en weer, dan toont géén enkel beeld alle veertien kruispunten. Je duidt aan wat je nú ziet,
// spoelt door, neemt een tweede beeld en duidt de rest aan. Elk beeld wordt bewaard mét zijn
// tijdstip en gaat als ijkbeeld naar het volgen — dat rekent daartussen de camerabeweging uit.
//
// Werkt enkel op een geüpload bestand: een YouTube-speler laat zijn beeld niet uitlezen.

type Punt = { label: string; x: number; y: number }
/** Meters per pixel per derde van het veld: waar meet dit standpunt scherp, en waar ruw? */
type Precisie = { thuis?: number; midden?: number; uit?: number; slechtste?: number }
/** Wat de server uit de punten terugrekende over waar de camera stond. */
type Standpunt = {
  oordeel: string
  gemeten?: { x_m: number; y_m: number; hoogte_m: number; brandpunt_px: number } | null
}
type Beeld = {
  tijd: number
  beeldBreedte: number
  beeldHoogte: number
  punten: Punt[]
  /** Alleen in dit scherm: het genomen frame. Wordt niet bewaard (te zwaar). */
  frame?: string
}

const klok = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export function Kalibreren({
  matchId,
  videoUrl,
  initieel,
}: {
  matchId: number
  videoUrl: string | null
  initieel: {
    punten?: Punt[]
    beelden?: Beeld[]
    precisie?: Precisie | null
    positie?: string | null
    standpunt?: Standpunt | null
  } | null
}) {
  // Oudere kalibraties hebben één puntenlijst zonder tijdstip; die blijft gewoon werken.
  const [beelden, setBeelden] = useState<Beeld[]>(() => {
    if (initieel?.beelden?.length) return initieel.beelden.map((b) => ({ ...b, frame: undefined }))
    if (initieel?.punten?.length) {
      return [{ tijd: 0, beeldBreedte: 0, beeldHoogte: 0, punten: initieel.punten }]
    }
    return []
  })
  const [precisie, setPrecisie] = useState<Precisie | null>(initieel?.precisie ?? null)
  const [positie, setPositie] = useState<string>(initieel?.positie ?? '')
  const [standpunt, setStandpunt] = useState<Standpunt | null>(initieel?.standpunt ?? null)
  const [actief, setActief] = useState<number | null>(null)
  const [gekozenLabel, setGekozenLabel] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [melding, setMelding] = useState<string | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const isBestand = Boolean(videoUrl && !/youtu\.?be/i.test(videoUrl))
  const huidig = actief != null ? beelden[actief] : null

  /** Op welk beeld staat dit punt al? (Voor het overzicht: wat is er al aangeduid.) */
  const gezetOp = useMemo(() => {
    const kaart = new Map<string, number>()
    beelden.forEach((b, i) => b.punten.forEach((p) => kaart.set(p.label, i)))
    return kaart
  }, [beelden])

  const volgende =
    gekozenLabel ??
    ALLE_LABELS.find((l) => !gezetOp.has(l)) ??
    null

  const pakBeeld = () => {
    const v = videoRef.current
    if (!v || !v.videoWidth) {
      setFout('De video is nog niet geladen — speel ze even af en probeer opnieuw.')
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(v, 0, 0)
    setBeelden((lijst) => {
      // 0.95 en niet 0.85: bij sterke vergroting verschuiven JPEG-blokjes de schijnbare plek
      // van een dunne witte lijn met een pixel of twee — precies de nauwkeurigheid die de loep
      // moet opleveren. Het frame wordt toch nooit verstuurd, dus het kost enkel geheugen.
      const nieuw: Beeld = {
        tijd: Math.round(v.currentTime * 10) / 10,
        beeldBreedte: v.videoWidth,
        beeldHoogte: v.videoHeight,
        punten: [],
        frame: canvas.toDataURL('image/jpeg', 0.95),
      }
      setActief(lijst.length)
      return [...lijst, nieuw]
    })
    setFout(null)
    setMelding(null)
  }

  // Het omrekenen van scherm naar beeldpixels zit in KalibratieDoek (en in de geteste module
  // kalibratie-zoom): hier komen alleen nog échte beeldcoördinaten binnen.
  const zetPunt = (x: number, y: number) => {
    if (actief == null || !volgende) return
    setBeelden((lijst) =>
      lijst.map((b, i) =>
        i === actief
          ? { ...b, punten: [...b.punten.filter((p) => p.label !== volgende), { label: volgende, x, y }] }
          : // Hetzelfde punt op een ander beeld zetten vervangt het oude: één plek per punt.
            { ...b, punten: b.punten.filter((p) => p.label !== volgende) },
      ),
    )
    setGekozenLabel(null)
  }

  const wisPunt = (label: string) => {
    setBeelden((lijst) => lijst.map((b) => ({ ...b, punten: b.punten.filter((p) => p.label !== label) })))
  }

  const wisBeeld = (i: number) => {
    setBeelden((lijst) => lijst.filter((_, j) => j !== i))
    setActief(null)
  }

  const bewaar = async () => {
    setBusy(true)
    setFout(null)
    setMelding(null)
    try {
      const res = await fetch(`/api/cv/match/${matchId}/kalibratie`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          positie: positie || null,
          beelden: beelden
            .filter((b) => b.punten.length > 0)
            .map((b) => ({
              tijd: b.tijd,
              beeldBreedte: b.beeldBreedte,
              beeldHoogte: b.beeldHoogte,
              punten: b.punten,
            })),
        }),
      })
      const data = (await res.json()) as {
        error?: string
        beelden?: number
        punten?: number
        bruikbaar?: number
        precisie?: Precisie | null
        gespiegeld?: boolean
        standpunt?: Standpunt | null
      }
      if (!res.ok) {
        setFout(data.error ?? 'Bewaren mislukt.')
        return
      }
      setPrecisie(data.precisie ?? null)
      setStandpunt(data.standpunt ?? null)
      const spiegel = data.gespiegeld
        ? ' Links en rechts stonden verwisseld — dat is rechtgezet.'
        : ''
      setMelding(
        data.bruikbaar && data.bruikbaar < (data.beelden ?? 0)
          ? `Bewaard: ${data.punten} punten. ${data.bruikbaar} van de ${data.beelden} beelden hebben er genoeg (4+) om als ijkbeeld te dienen.${spiegel}`
          : `Bewaard: ${data.punten} punten over ${data.beelden} ${data.beelden === 1 ? 'beeld' : 'beelden'}.${spiegel}`,
      )
    } catch {
      setFout('Netwerkfout — probeer opnieuw.')
    } finally {
      setBusy(false)
    }
  }

  const totaal = gezetOp.size
  const bruikbareBeelden = beelden.filter((b) => b.punten.length >= 4).length

  return (
    <details className="an-fold kal" id="kalibratie">
      <summary>
        📍 Veldkalibratie{' '}
        <span className="tm-sum">
          {totaal >= 4
            ? `${totaal} van de 14 punten aangeduid${beelden.length > 1 ? ` over ${beelden.length} beelden` : ''}`
            : 'nog niet gezet — nodig om te weten wáár de bal landt'}
        </span>
      </summary>
      <div className="kal-body">
        {!isBestand ? (
          <p className="sa-let-op">
            Kalibreren kan alleen op een geüploade video. Een YouTube-speler laat zijn beeld niet
            uitlezen — upload het bestand om ook zones en afstanden te laten berekenen.
          </p>
        ) : (
          <>
            <p className="tm-lead">
              Wijs aan waar de lijnen van dít veld liggen. Zie je niet alles tegelijk — bij een
              camera die pant is dat normaal — spoel dan door, neem een tweede beeld en duid daar
              de rest aan. Elk beeld telt mee op zijn eigen tijdstip.
            </p>
            <p className="sa-hint">
              Is de opname onderbroken (camera gestopt en opnieuw gestart)? Neem dan in élk stuk
              een beeld. Over zo'n onderbreking kan de server de camera niet volgen, dus een stuk
              zonder eigen ijkbeeld wordt niet gemeten — na de analyse zie je hier welk stuk dat is.
            </p>

            <label className="kal-standpunt">
              <span>Waar stond de camera?</span>
              <select value={positie} onChange={(e) => setPositie(e.target.value)}>
                <option value="">— kies je standpunt —</option>
                {[...new Set(CAMERA_POSITIES.map((p) => p.groep))].map((groep) => (
                  <optgroup key={groep} label={groep}>
                    {CAMERA_POSITIES.filter((p) => p.groep === groep).map((p) => (
                      <option key={p.sleutel} value={p.sleutel}>
                        {p.naam}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <span className="sa-hint">
                De server rekent uit je punten terug waar de camera écht stond en legt dat naast
                deze keuze — klopt het niet, dan zit er een fout in het aanduiden.
              </span>
            </label>

            <video
              ref={videoRef}
              className="kal-video"
              src={videoUrl ?? undefined}
              controls
              playsInline
              crossOrigin="anonymous"
              preload="metadata"
            />
            <div className="kal-acties">
              <button type="button" className="va-btn primary" onClick={pakBeeld}>
                📷 Neem dit beeld
              </button>
            </div>

            {beelden.length > 0 && (
              <div className="kal-beelden">
                {beelden.map((b, i) => (
                  <button
                    key={`${b.tijd}-${i}`}
                    type="button"
                    className={`kal-tab${i === actief ? ' aan' : ''}`}
                    onClick={() => setActief(i)}
                  >
                    Beeld {i + 1} · {klok(b.tijd)}
                    <span className="kal-tel">{b.punten.length}</span>
                  </button>
                ))}
              </div>
            )}

            {huidig && (
              <>
                {huidig.frame ? (
                  <KalibratieDoek
                    frame={huidig.frame}
                    beeldBreedte={huidig.beeldBreedte}
                    beeldHoogte={huidig.beeldHoogte}
                    punten={huidig.punten}
                    volgende={volgende}
                    meterPerPixel={precisie?.slechtste ?? null}
                    onZet={zetPunt}
                    beschrijf={beschrijf}
                  />
                ) : (
                  <p className="sa-hint">
                    Dit beeld komt uit een eerdere sessie: de punten staan er nog, het beeld zelf
                    niet. Wil je hier iets verplaatsen, spoel dan naar {klok(huidig.tijd)} en neem
                    het beeld opnieuw.
                  </p>
                )}
                <p className="kal-volgende">
                  {volgende ? (
                    <>
                      Tik nu aan: <strong>{beschrijf(volgende)}</strong>
                    </>
                  ) : (
                    <>Alle veertien punten staan er. Bewaar hieronder.</>
                  )}
                </p>
                <div className="kal-acties">
                  <button type="button" className="va-btn" onClick={() => wisBeeld(actief!)}>
                    Dit beeld weg
                  </button>
                </div>
              </>
            )}

            <div className="kal-lijst">
              <div className="kal-kop">
                <span>{totaal} van de 14 punten</span>
                <span className="sa-hint">tik een rij aan om dat punt (opnieuw) te zetten</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Lijn</th>
                    {ZIJDEN.map((z) => (
                      <th key={z}>zijlijn {z}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DWARSLIJNEN.map((lijn) => (
                    <tr key={lijn.sleutel}>
                      <th scope="row">
                        {lijn.naam}
                        {lijn.kant && <span className="kal-kant"> {lijn.kant}</span>}
                      </th>
                      {ZIJDEN.map((z) => {
                        const label = labelVan(lijn.sleutel, z)
                        const beeldIndex = gezetOp.get(label)
                        const gezet = beeldIndex != null
                        return (
                          <td key={z}>
                            <button
                              type="button"
                              className={`kal-cel${gezet ? ' gezet' : ''}${volgende === label ? ' beurt' : ''}`}
                              onClick={() => setGekozenLabel(label)}
                              title={omschrijving(lijn, z as Zijde)}
                            >
                              {gezet ? `✓ beeld ${beeldIndex + 1}` : '—'}
                            </button>
                            {gezet && (
                              <button type="button" className="kal-wis" onClick={() => wisPunt(label)} title="wissen">
                                ✕
                              </button>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {standpunt?.gemeten && (
              <div className={`kal-precisie${standpunt.oordeel === 'wijkt af' ? ' ruw' : ''}`}>
                <strong>Teruggerekend uit je punten</strong>{' '}
                <span>
                  camera op {Math.abs(standpunt.gemeten.hoogte_m).toFixed(1)} m hoogte,{' '}
                  {beschrijfPlek(standpunt.gemeten)}
                </span>
                {standpunt.oordeel === 'wijkt af' ? (
                  <p>
                    Dat strookt niet met het standpunt dat je koos. Kijk je aangeduide punten na —
                    of pas de keuze hierboven aan.
                  </p>
                ) : standpunt.oordeel === 'onzeker' ? (
                  <p>
                    Onzeker: het standpunt verschuift te veel als één punt wegvalt. Duid er meer
                    aan, goed verspreid over het veld.
                  </p>
                ) : (
                  <p>Dat klopt met wat je koos.</p>
                )}
              </div>
            )}

            {precisie && (
              <div className={`kal-precisie${(precisie.slechtste ?? 0) > 0.25 ? ' ruw' : ''}`}>
                <strong>Scherpte van dit standpunt</strong>{' '}
                <span>
                  {(['thuis', 'midden', 'uit'] as const)
                    .filter((k) => precisie[k] != null)
                    .map((k) => `${{ thuis: 'thuiskant', midden: 'midden', uit: 'uitkant' }[k]} ${Math.round(precisie[k]! * 100)} cm`)
                    .join(' · ')}{' '}
                  per pixel
                </span>
                {(precisie.slechtste ?? 0) > 0.25 ? (
                  <p>
                    Achteraan is één pixel {Math.round((precisie.slechtste ?? 0) * 100)} cm waard —
                    een landingspunt dáár is een schatting, geen meting. Dat hoort bij een camera
                    die in de diepte kijkt: hoe hoger ze staat, hoe scherper de overkant wordt.
                  </p>
                ) : (
                  <p>Over het hele veld ongeveer even scherp — goed standpunt.</p>
                )}
              </div>
            )}

            <div className="tm-acties">
              <button
                type="button"
                className="va-btn primary"
                disabled={busy || bruikbareBeelden === 0}
                onClick={() => void bewaar()}
              >
                {busy ? 'Bewaren…' : 'Kalibratie bewaren'}
              </button>
              {bruikbareBeelden === 0 && totaal > 0 && (
                <span className="sa-hint">Eén beeld heeft minstens vier punten nodig.</span>
              )}
              {melding && <span className="tm-ok">{melding}</span>}
              {fout && <span className="tm-fout">{fout}</span>}
            </div>
          </>
        )}
      </div>
    </details>
  )
}

/** Het teruggerekende punt in mensentaal: hoeveel meter naast of achter het veld. */
function beschrijfPlek(g: { x_m: number; y_m: number }): string {
  const stukken: string[] = []
  if (g.y_m < 0) stukken.push(`${Math.abs(g.y_m).toFixed(0)} m achter de thuislijn`)
  else if (g.y_m > 46) stukken.push(`${(g.y_m - 46).toFixed(0)} m achter de uitlijn`)
  else stukken.push(`ter hoogte van ${g.y_m.toFixed(0)} m op het veld`)
  if (g.x_m < 0) stukken.push(`${Math.abs(g.x_m).toFixed(0)} m links ernaast`)
  else if (g.x_m > 14) stukken.push(`${(g.x_m - 14).toFixed(0)} m rechts ernaast`)
  return stukken.join(', ')
}

function beschrijf(label: string): string {
  const zijde = label.endsWith('_rechts') ? 'rechts' : 'links'
  const lijn = DWARSLIJNEN.find((l) => label === labelVan(l.sleutel, zijde as Zijde))
  return lijn ? omschrijving(lijn, zijde as Zijde) : label
}
