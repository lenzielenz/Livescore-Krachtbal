'use client'

import { useCallback, useEffect, useState } from 'react'

import { windPijl, windTekst } from '@/lib/wind'

import './weather.css'

// Compacte weersverwachting voor de gekozen dag — krachtbal is een buitensport, dus temperatuur
// én wind tellen. Data via Open-Meteo (gratis, geen sleutel, client-side). Locatie: ingelogd met
// een club → die club; anders de standaardplaats Brugge (geen locatie-prompt).
const DEFAULT = { lat: 51.2093, lon: 3.2247, place: 'Brugge' }
type Loc = { lat: number; lon: number; place: string }

type Weather = { code: number; tmax: number; tmin: number; wind: number }

function describe(code: number): { emoji: string; label: string } {
  if (code === 0) return { emoji: '☀️', label: 'Helder' }
  if (code <= 2) return { emoji: '🌤️', label: 'Licht bewolkt' }
  if (code === 3) return { emoji: '☁️', label: 'Bewolkt' }
  if (code === 45 || code === 48) return { emoji: '🌫️', label: 'Mist' }
  if (code >= 51 && code <= 57) return { emoji: '🌦️', label: 'Motregen' }
  if (code >= 61 && code <= 67) return { emoji: '🌧️', label: 'Regen' }
  if (code >= 71 && code <= 77) return { emoji: '❄️', label: 'Sneeuw' }
  if (code >= 80 && code <= 82) return { emoji: '🌦️', label: 'Buien' }
  if (code === 85 || code === 86) return { emoji: '🌨️', label: 'Sneeuwbuien' }
  if (code >= 95) return { emoji: '⛈️', label: 'Onweer' }
  return { emoji: '⛅', label: 'Wisselend' }
}

// Uren-voorspelling (popover onder de header-weerchip): de komende ~12 uur met temperatuur,
// regenkans en wind.
//
// Drie dingen die eerder ontbraken en die een popover pas af maken:
//   • wegklikken mag niet knallen. Er stond geen enkele overgang op, dus verdween hij van het
//     ene beeld op het andere — dat leest als een storing. Nu vaagt hij weg, en pas daarna
//     verdwijnt hij echt uit het scherm;
//   • Escape sluit hem ook. Wie met een toetsenbord werkt, kwam er anders niet uit;
//   • wind hoort erbij. Krachtbal is een buitensport waar de bal ver door de lucht gaat: de
//     richting en kracht van de wind zijn speelinformatie, geen weetje.
const SLUIT_MS = 160

type Uur = { label: string; emoji: string; temp: number; prob: number; wind: number; windRichtingGraden: number | null }

function WeatherHours({ onClose, loc }: { onClose: () => void; loc: Loc }) {
  const [hours, setHours] = useState<Uur[] | null>(null)
  // Eerst wegvagen, dán pas weghalen: een popover die abrupt verdwijnt oogt als een fout.
  const [sluitend, setSluitend] = useState(false)
  const sluit = useCallback(() => {
    setSluitend(true)
    setTimeout(onClose, SLUIT_MS)
  }, [onClose])

  // Escape sluit ook — anders zit wie met een toetsenbord werkt vast.
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
    let cancelled = false
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
      `&hourly=temperature_2m,weather_code,precipitation_probability,wind_speed_10m,wind_direction_10m` +
      `&forecast_days=2&timezone=Europe%2FBrussels`
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('weer'))))
      .then((d: { hourly?: Record<string, (number | string)[]> }) => {
        if (cancelled) return
        const h = d.hourly
        const tijden = (h?.time as string[] | undefined) ?? []
        if (!tijden.length) {
          setHours([])
          return
        }
        const now = Date.now()
        const out: Uur[] = []
        for (let i = 0; i < tijden.length && out.length < 12; i++) {
          if (new Date(tijden[i]).getTime() < now - 3600_000) continue
          const richting = Number(h?.wind_direction_10m?.[i])
          out.push({
            label: `${tijden[i].slice(11, 13)}u`,
            emoji: describe(Number(h?.weather_code?.[i] ?? 0)).emoji,
            temp: Math.round(Number(h?.temperature_2m?.[i] ?? 0)),
            prob: Number(h?.precipitation_probability?.[i] ?? 0),
            wind: Math.round(Number(h?.wind_speed_10m?.[i] ?? 0)),
            windRichtingGraden: Number.isFinite(richting) ? richting : null,
          })
        }
        setHours(out)
      })
      .catch(() => {
        if (!cancelled) setHours([])
      })
    return () => {
      cancelled = true
    }
  }, [loc.lat, loc.lon])

  // De wind van het eerstvolgende uur staat groot bovenaan: dát is wat je nu op het veld voelt.
  const nu = hours?.[0]

  return (
    <>
      <span className={`wx-pop-backdrop${sluitend ? ' dicht' : ''}`} onClick={sluit} aria-hidden />
      <div className={`wx-pop${sluitend ? ' dicht' : ''}`} role="dialog" aria-label="Uren-voorspelling">
        <div className="wx-pop-head">
          <span className="wx-pop-titel">Volgende uren · {loc.place}</span>
          <button type="button" className="wx-pop-sluit" onClick={sluit} aria-label="Sluiten">✕</button>
        </div>
        {nu && (
          <div className="wx-pop-nu">
            <span className="wx-pop-nu-ico" aria-hidden>{nu.emoji}</span>
            <span className="wx-pop-nu-temp">{nu.temp}°</span>
            <span className="wx-pop-nu-wind">
              <span className="wx-pop-nu-pijl" aria-hidden>{windPijl(nu.windRichtingGraden ?? Number.NaN)}</span>
              {windTekst(nu.wind, nu.windRichtingGraden)}
            </span>
          </div>
        )}
        {hours == null ? (
          <div className="wx-pop-empty">Weer ophalen…</div>
        ) : hours.length === 0 ? (
          <div className="wx-pop-empty">Geen voorspelling beschikbaar.</div>
        ) : (
          <div className="wx-pop-hours">
            {hours.map((h, i) => (
              <div className="wx-pop-hour" key={i}>
                <span className="wx-pop-time">{h.label}</span>
                <span className="wx-pop-ico" aria-hidden>{h.emoji}</span>
                <span className="wx-pop-temp">{h.temp}°</span>
                <span className="wx-pop-wind" title={windTekst(h.wind, h.windRichtingGraden)}>
                  <span aria-hidden>{windPijl(h.windRichtingGraden ?? Number.NaN)}</span> {h.wind}
                </span>
                <span className="wx-pop-prob">{h.prob >= 20 ? `${h.prob}%` : ''}</span>
              </div>
            ))}
          </div>
        )}
        <div className="wx-pop-voet">💨 in km/u · de pijl wijst waar de wind naartoe waait</div>
      </div>
    </>
  )
}

export function WeatherWidget({ date, variant = 'full' }: { date?: string; variant?: 'full' | 'compact' }) {
  const day = date ?? new Date().toISOString().slice(0, 10)
  const [w, setW] = useState<Weather | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'none'>('loading')
  const [open, setOpen] = useState(false)
  // Locatie: ingelogd met club → die club; anders Brugge. Wordt na het laden bijgewerkt.
  const [loc, setLoc] = useState<Loc>(DEFAULT)
  useEffect(() => {
    let cancelled = false
    fetch('/api/my-weather-place', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Loc | null) => {
        if (!cancelled && d && Number.isFinite(d.lat) && Number.isFinite(d.lon)) setLoc(d)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setState('loading')
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max` +
      `&timezone=Europe%2FBrussels&start_date=${day}&end_date=${day}`
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('weer'))))
      .then((d: { daily?: Record<string, (number | string)[]> }) => {
        if (cancelled) return
        const dd = d.daily
        const tmax = dd?.temperature_2m_max?.[0]
        if (!dd || tmax == null) {
          setState('none')
          return
        }
        setW({
          code: Number(dd.weather_code?.[0] ?? 0),
          tmax: Math.round(Number(dd.temperature_2m_max[0])),
          tmin: Math.round(Number(dd.temperature_2m_min?.[0] ?? tmax)),
          wind: Math.round(Number(dd.wind_speed_10m_max?.[0] ?? 0)),
        })
        setState('ok')
      })
      .catch(() => {
        if (!cancelled) setState('none')
      })
    return () => {
      cancelled = true
    }
  }, [day, loc.lat, loc.lon])

  // Compacte variant voor de header: icoon + temperatuur, klikbaar → uren-voorspelling.
  if (variant === 'compact') {
    if (state !== 'ok' || !w) return null
    const i = describe(w.code)
    return (
      <span className="wx-mini-wrap">
        <button
          type="button"
          className="wx-mini"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          title="Toon de voorspelling voor de volgende uren"
        >
          <span aria-hidden>{i.emoji}</span> {w.tmax}° <span className="wx-mini-caret" aria-hidden>▾</span>
        </button>
        {open && <WeatherHours onClose={() => setOpen(false)} loc={loc} />}
      </span>
    )
  }

  if (state === 'none') return null
  if (state === 'loading') {
    return (
      <div className="wx wx-skel" aria-hidden>
        <span className="wx-emoji">⛅</span>
        <div className="wx-body">
          <span className="wx-temp">Weer ophalen…</span>
        </div>
      </div>
    )
  }
  if (!w) return null
  const i = describe(w.code)
  return (
    <div className="wx" title={`Weersverwachting (${loc.place})`}>
      <span className="wx-emoji" aria-hidden>{i.emoji}</span>
      <div className="wx-body">
        <span className="wx-temp">
          {w.tmax}° <span className="wx-min">/ {w.tmin}°</span>
        </span>
        <span className="wx-meta">{i.label} · 💨 {windTekst(w.wind, null)}</span>
      </div>
      <span className="wx-place">{loc.place}</span>
    </div>
  )
}
