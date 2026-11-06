'use client'

import { useCallback, useEffect, useState } from 'react'

import { bouwWeerbericht, omschrijving, sceneVoor, speeladvies, temperatuurLijn, type OpenMeteoAntwoord, type Weerbericht as WeerberichtData } from '@/lib/weerbericht'
import { windOmschrijving, windRichting } from '@/lib/wind'

import './weerbericht.css'

// Het uitgebreide weerbericht achter de weerchip in de sitekop: een bewegende weerscène (zon,
// wolken, regen, sneeuw, onweer, mist, of maan en sterren 's nachts), het weer van nu met een
// windkompas, één zin speeladvies, de komende uren met temperatuurlijn en regenkans, en de
// komende dagen. Data: Open-Meteo (gratis, geen sleutel), omgezet in lib/weerbericht.ts.
//
// Alle beweging is CSS (transform/opacity) en draait enkel zolang het venster open is; wie
// liever geen beweging ziet (prefers-reduced-motion), krijgt een stilstaande scène.

const SLUIT_MS = 160
const KOLOM = 54 // breedte van één uur in de urenstrip (px)
const LIJN_H = 46 // hoogte van de temperatuurlijn (px)

type Loc = { lat: number; lon: number; place: string }

function urlVoor(loc: Loc): string {
  return (
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
    `&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m,precipitation` +
    `&hourly=temperature_2m,weather_code,precipitation_probability,wind_speed_10m,wind_direction_10m,is_day` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset` +
    `&forecast_days=5&timezone=Europe%2FBrussels`
  )
}

/** Vaste, "willekeurig" ogende spreiding (geen Math.random: zelfde beeld bij elke render). */
const spreid = (i: number, n: number) => ((i * 37) % n) / n

function Scene({ code, isDag, wind }: { code: number; isDag: boolean; wind: number }) {
  const scene = sceneVoor(code)
  const nacht = !isDag
  const metZon = !nacht && (scene === 'helder' || scene === 'halfbewolkt')
  const metMaan = nacht && (scene === 'helder' || scene === 'halfbewolkt')
  const wolken = scene === 'helder' ? 0 : scene === 'halfbewolkt' ? 2 : scene === 'mist' ? 1 : 3
  const donkereWolken = scene === 'regen' || scene === 'onweer' || scene === 'sneeuw' || scene === 'motregen'
  const druppels = scene === 'regen' || scene === 'onweer' ? 26 : scene === 'motregen' ? 14 : 0
  const vlokken = scene === 'sneeuw' ? 22 : 0
  // Windstrepen vanaf een merkbare wind; hoe harder, hoe sneller ze voorbij schieten.
  const strepen = wind >= 12 ? Math.min(6, 2 + Math.floor(wind / 10)) : 0
  const windDuur = `${Math.max(0.7, 2.6 - wind / 25).toFixed(2)}s`

  return (
    <div className={`wbr-scene wbr-${scene}${nacht ? ' nacht' : ''}`} style={{ ['--wbr-windduur' as string]: windDuur }} aria-hidden>
      {nacht &&
        Array.from({ length: 14 }, (_, i) => (
          <span key={`s${i}`} className="wbr-ster" style={{ left: `${6 + spreid(i, 14) * 88}%`, top: `${8 + spreid(i * 3 + 1, 14) * 50}%`, animationDelay: `${(i % 7) * 0.45}s` }} />
        ))}
      {metZon && (
        <span className="wbr-zon">
          <span className="wbr-zon-stralen" />
        </span>
      )}
      {metMaan && <span className="wbr-maan" />}
      {Array.from({ length: wolken }, (_, i) => (
        <span
          key={`w${i}`}
          className={`wbr-wolk${donkereWolken ? ' donker' : ''}`}
          style={{
            // Bovenaan de hemel houden: de temperatuur en omschrijving staan linksonder.
            top: `${2 + i * 11}%`,
            ['--wbr-schaal' as string]: String(0.85 - i * 0.15),
            animationDuration: `${22 + i * 9}s`,
            animationDelay: `${-i * 7}s`,
          }}
        />
      ))}
      {Array.from({ length: druppels }, (_, i) => (
        <span
          key={`d${i}`}
          className={`wbr-druppel${scene === 'motregen' ? ' fijn' : ''}`}
          style={{ left: `${spreid(i, druppels) * 100}%`, animationDelay: `${(i % 9) * 0.11}s`, animationDuration: `${0.55 + (i % 5) * 0.08}s` }}
        />
      ))}
      {Array.from({ length: vlokken }, (_, i) => (
        <span
          key={`v${i}`}
          className="wbr-vlok"
          style={{ left: `${spreid(i, vlokken) * 100}%`, animationDelay: `${(i % 11) * 0.35}s`, animationDuration: `${3.2 + (i % 4) * 0.6}s` }}
        />
      ))}
      {scene === 'onweer' && (
        <>
          <span className="wbr-flits" />
          <span className="wbr-bliksem" />
        </>
      )}
      {scene === 'mist' && [0, 1, 2].map((i) => <span key={`m${i}`} className="wbr-mist" style={{ top: `${38 + i * 18}%`, animationDelay: `${-i * 4}s` }} />)}
      {Array.from({ length: strepen }, (_, i) => (
        <span key={`r${i}`} className="wbr-windstreep" style={{ top: `${20 + spreid(i, strepen) * 60}%`, animationDelay: `${i * 0.37}s` }} />
      ))}
    </div>
  )
}

function Kompas({ graden, kmu }: { graden: number | null; kmu: number }) {
  // De pijl wijst waar de wind naartoe waait (180° van waar hij vandaan komt), net als elders.
  const rot = graden == null ? 0 : (graden + 180) % 360
  return (
    <div className="wbr-kompas" aria-hidden>
      <span className="wbr-kompas-n">N</span>
      <span className="wbr-kompas-o">O</span>
      <span className="wbr-kompas-z">Z</span>
      <span className="wbr-kompas-w">W</span>
      {graden != null && (
        <span className="wbr-kompas-pijl" style={{ ['--wbr-rot' as string]: `${rot}deg`, animationDuration: `${Math.max(1.2, 4 - kmu / 12).toFixed(1)}s` }}>
          <span />
        </span>
      )}
      <span className="wbr-kompas-kern" />
    </div>
  )
}

export function Weerbericht({ onClose, loc }: { onClose: () => void; loc: Loc }) {
  const [data, setData] = useState<WeerberichtData | null | 'fout'>(null)
  const [sluitend, setSluitend] = useState(false)
  const sluit = useCallback(() => {
    setSluitend(true)
    setTimeout(onClose, SLUIT_MS)
  }, [onClose])

  useEffect(() => {
    const opToets = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        sluit()
      }
    }
    window.addEventListener('keydown', opToets)
    return () => window.removeEventListener('keydown', opToets)
  }, [sluit])

  useEffect(() => {
    let weg = false
    setData(null)
    fetch(urlVoor(loc))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('weer'))))
      .then((d: OpenMeteoAntwoord) => {
        if (!weg) setData(bouwWeerbericht(d) ?? 'fout')
      })
      .catch(() => {
        if (!weg) setData('fout')
      })
    return () => {
      weg = true
    }
  }, [loc])

  const w = data && data !== 'fout' ? data : null
  const nuInfo = w ? omschrijving(w.nu.code, w.nu.isDag) : null
  const vandaag = w?.dagen[0]
  const kansKomend = w ? Math.max(0, ...w.uren.slice(0, 3).map((u) => u.kans)) : 0
  const advies = w ? speeladvies(w.nu, kansKomend) : null
  const lijn = w ? temperatuurLijn(w.uren.map((u) => u.temp), w.uren.length * KOLOM, LIJN_H) : []
  const lijnPad = lijn.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const vlakPad = lijn.length ? `${lijnPad} L${lijn[lijn.length - 1].x.toFixed(1)},${LIJN_H} L${lijn[0].x.toFixed(1)},${LIJN_H} Z` : ''
  const weekMin = w?.dagen.length ? Math.min(...w.dagen.map((d) => d.min)) : 0
  const weekMax = w?.dagen.length ? Math.max(...w.dagen.map((d) => d.max)) : 1
  const weekBereik = weekMax - weekMin || 1

  return (
    <>
      <span className={`wx-pop-backdrop${sluitend ? ' dicht' : ''}`} onClick={sluit} aria-hidden />
      <div className={`wx-pop wbr${sluitend ? ' dicht' : ''}`} role="dialog" aria-label={`Weerbericht ${loc.place}`}>
        <button type="button" className="wbr-sluit" onClick={sluit} aria-label="Sluiten">✕</button>

        {data == null ? (
          <div className="wbr-laden">
            <span className="wbr-laden-wolk" aria-hidden>⛅</span> Weer ophalen…
          </div>
        ) : !w || !nuInfo ? (
          <div className="wbr-laden">Geen weerbericht beschikbaar.</div>
        ) : (
          <>
            {/* Held: de bewegende scène met het weer van nu erover. */}
            <section className="wbr-held">
              <Scene code={w.nu.code} isDag={w.nu.isDag} wind={w.nu.wind} />
              <div className="wbr-held-tekst">
                <span className="wbr-plaats">📍 {loc.place}</span>
                <span className="wbr-temp">{w.nu.temp}°</span>
                <span className="wbr-label">{nuInfo.label}</span>
                <span className="wbr-sub">
                  Voelt als {w.nu.voeltAls}°{vandaag ? ` · ↓ ${vandaag.min}° ↑ ${vandaag.max}°` : ''}
                </span>
              </div>
            </section>

            {advies && (
              <p className="wbr-advies">
                <span aria-hidden>{advies.emoji}</span> {advies.tekst}
              </p>
            )}

            {/* Wind groot met kompas (speelinformatie), daarnaast regen, vocht en zon. */}
            <section className="wbr-tegels">
              <div className="wbr-tegel wbr-tegel-wind">
                <Kompas graden={w.nu.windRichting} kmu={w.nu.wind} />
                <div className="wbr-tegel-tekst">
                  <span className="wbr-tegel-kop">Wind</span>
                  <span className="wbr-tegel-waarde">
                    {w.nu.wind} <small>km/u</small>
                  </span>
                  <span className="wbr-tegel-sub">
                    {w.nu.windRichting != null ? `uit ${windRichting(w.nu.windRichting)} · ` : ''}
                    {windOmschrijving(w.nu.wind)}
                  </span>
                  {w.nu.windstoten > w.nu.wind + 4 && <span className="wbr-tegel-sub">stoten tot {w.nu.windstoten} km/u</span>}
                </div>
              </div>
              <div className="wbr-tegel">
                <span className="wbr-tegel-kop">💧 Regen</span>
                <span className="wbr-tegel-waarde">
                  {kansKomend}
                  <small>%</small>
                </span>
                <span className="wbr-meter" aria-hidden>
                  <span style={{ width: `${kansKomend}%` }} />
                </span>
                <span className="wbr-tegel-sub">kans, 3 uur</span>
              </div>
              <div className="wbr-tegel">
                <span className="wbr-tegel-kop">💦 Vocht</span>
                <span className="wbr-tegel-waarde">
                  {w.nu.vochtigheid ?? '–'}
                  <small>%</small>
                </span>
                <span className="wbr-meter vocht" aria-hidden>
                  <span style={{ width: `${w.nu.vochtigheid ?? 0}%` }} />
                </span>
              </div>
              {(w.zon.op || w.zon.onder) && (
                <div className="wbr-tegel">
                  <span className="wbr-tegel-kop">🌅 Zon</span>
                  <span className="wbr-tegel-zon">
                    <span>↑ {w.zon.op ?? '–'}</span>
                    <span>↓ {w.zon.onder ?? '–'}</span>
                  </span>
                </div>
              )}
            </section>

            {/* De komende uren: temperatuurlijn over de strip, regenkans als balkjes onderaan. */}
            {w.uren.length > 0 && (
              <section className="wbr-uren-wrap">
                <h3 className="wbr-kop">Komende uren</h3>
                <div className="wbr-uren" style={{ ['--wbr-kolom' as string]: `${KOLOM}px` }}>
                  <div className="wbr-uren-binnen" style={{ width: w.uren.length * KOLOM }}>
                    <svg className="wbr-lijn" width={w.uren.length * KOLOM} height={LIJN_H} viewBox={`0 0 ${w.uren.length * KOLOM} ${LIJN_H}`} aria-hidden>
                      <defs>
                        <linearGradient id="wbr-vlak" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#ffb547" stopOpacity="0.45" />
                          <stop offset="100%" stopColor="#ffb547" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path d={vlakPad} fill="url(#wbr-vlak)" />
                      <path d={lijnPad} className="wbr-lijn-pad" fill="none" />
                      {lijn.map((p, i) => (
                        <circle key={i} cx={p.x} cy={p.y} r={i === 0 ? 3.6 : 2.4} className={i === 0 ? 'wbr-lijn-nu' : 'wbr-lijn-punt'} />
                      ))}
                    </svg>
                    <div className="wbr-uren-rij">
                      {w.uren.map((u, i) => (
                        <div key={u.tijd} className={`wbr-uur${i === 0 ? ' nu' : ''}`}>
                          <span className="wbr-uur-temp">{u.temp}°</span>
                          <span className="wbr-uur-ico" aria-hidden>{omschrijving(u.code, u.isDag).emoji}</span>
                          <span className="wbr-uur-wind" title={`${u.wind} km/u`}>
                            {u.windRichting != null && (
                              <span className="wbr-uur-pijl" style={{ transform: `rotate(${(u.windRichting + 180) % 360}deg)` }} aria-hidden>↑</span>
                            )}
                            {u.wind}
                          </span>
                          <span className="wbr-uur-regen" aria-label={`${u.kans}% regenkans`}>
                            <span style={{ height: `${Math.max(u.kans, 2)}%` }} />
                          </span>
                          <span className="wbr-uur-kans">{u.kans >= 10 ? `${u.kans}%` : ''}</span>
                          <span className="wbr-uur-label">{u.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* De komende dagen, met een temperatuurbalk op één gedeelde schaal. */}
            {w.dagen.length > 1 && (
              <section className="wbr-dagen">
                <h3 className="wbr-kop">Komende dagen</h3>
                {w.dagen.map((d) => (
                  <div key={d.datum} className="wbr-dag">
                    <span className="wbr-dag-naam">{d.label}</span>
                    <span className="wbr-dag-ico" aria-hidden>{omschrijving(d.code).emoji}</span>
                    <span className="wbr-dag-kans">{d.kans >= 20 ? `💧${d.kans}%` : ''}</span>
                    <span className="wbr-dag-min">{d.min}°</span>
                    <span className="wbr-dag-balk" aria-hidden>
                      <span style={{ left: `${((d.min - weekMin) / weekBereik) * 100}%`, right: `${100 - ((d.max - weekMin) / weekBereik) * 100}%` }} />
                    </span>
                    <span className="wbr-dag-max">{d.max}°</span>
                  </div>
                ))}
              </section>
            )}

            <p className="wbr-voet">Bron: Open-Meteo · wind in km/u · de pijl wijst waar de wind naartoe waait</p>
          </>
        )}
      </div>
    </>
  )
}
