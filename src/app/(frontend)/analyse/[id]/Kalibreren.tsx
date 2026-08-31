'use client'

import { useMemo, useRef, useState } from 'react'

import { ALLE_LABELS, DWARSLIJNEN, ZIJDEN, labelVan, omschrijving, type Zijde } from '@/lib/kalibratie-punten'

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
  initieel: { punten?: Punt[]; beelden?: Beeld[] } | null
}) {
  // Oudere kalibraties hebben één puntenlijst zonder tijdstip; die blijft gewoon werken.
  const [beelden, setBeelden] = useState<Beeld[]>(() => {
    if (initieel?.beelden?.length) return initieel.beelden.map((b) => ({ ...b, frame: undefined }))
    if (initieel?.punten?.length) {
      return [{ tijd: 0, beeldBreedte: 0, beeldHoogte: 0, punten: initieel.punten }]
    }
    return []
  })
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
      const nieuw: Beeld = {
        tijd: Math.round(v.currentTime * 10) / 10,
        beeldBreedte: v.videoWidth,
        beeldHoogte: v.videoHeight,
        punten: [],
        frame: canvas.toDataURL('image/jpeg', 0.85),
      }
      setActief(lijst.length)
      return [...lijst, nieuw]
    })
    setFout(null)
    setMelding(null)
  }

  const klik = (e: React.MouseEvent<HTMLImageElement>) => {
    if (actief == null || !volgende) return
    const beeld = beelden[actief]
    const rect = e.currentTarget.getBoundingClientRect()
    // Van weergavepixels naar de échte beeldpixels: de server rekent met de videoresolutie.
    const x = Math.round(((e.clientX - rect.left) / rect.width) * beeld.beeldBreedte)
    const y = Math.round(((e.clientY - rect.top) / rect.height) * beeld.beeldHoogte)
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
      const data = (await res.json()) as { error?: string; beelden?: number; punten?: number; bruikbaar?: number }
      if (!res.ok) {
        setFout(data.error ?? 'Bewaren mislukt.')
        return
      }
      setMelding(
        data.bruikbaar && data.bruikbaar < (data.beelden ?? 0)
          ? `Bewaard: ${data.punten} punten. ${data.bruikbaar} van de ${data.beelden} beelden hebben er genoeg (4+) om als ijkbeeld te dienen.`
          : `Bewaard: ${data.punten} punten over ${data.beelden} ${data.beelden === 1 ? 'beeld' : 'beelden'}.`,
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
                  <div className="kal-doek">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={huidig.frame} alt={`Videobeeld op ${klok(huidig.tijd)}`} onClick={klik} />
                    {huidig.punten.map((p) => (
                      <span
                        key={p.label}
                        className="kal-punt"
                        style={{
                          left: `${(p.x / huidig.beeldBreedte) * 100}%`,
                          top: `${(p.y / huidig.beeldHoogte) * 100}%`,
                        }}
                        title={p.label}
                      >
                        ✓
                      </span>
                    ))}
                  </div>
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
                      <th key={z}>{z}</th>
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

function beschrijf(label: string): string {
  const zijde = label.endsWith('_rechts') ? 'rechts' : 'links'
  const lijn = DWARSLIJNEN.find((l) => label === labelVan(l.sleutel, zijde as Zijde))
  return lijn ? omschrijving(lijn, zijde as Zijde) : label
}
