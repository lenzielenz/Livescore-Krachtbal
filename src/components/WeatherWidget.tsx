'use client'

import { useEffect, useState } from 'react'

import { windTekst } from '@/lib/wind'

import { Weerbericht } from './Weerbericht'

import './weather.css'
import { dateStrBE } from '@/lib/datetime'

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

// Klik op de weerchip in de sitekop → het uitgebreide weerbericht (components/Weerbericht.tsx):
// bewegende weerscène, wind met kompas, speeladvies, de komende uren en dagen.

export function WeatherWidget({ date, variant = 'full' }: { date?: string; variant?: 'full' | 'compact' }) {
  // Belgische dag: het weerbericht hoort bij de dag zoals die hier geldt, niet bij de UTC-dag.
  const day = date ?? dateStrBE()
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
          title="Toon het weerbericht"
        >
          <span aria-hidden>{i.emoji}</span> {w.tmax}° <span className="wx-mini-caret" aria-hidden>▾</span>
        </button>
        {open && <Weerbericht onClose={() => setOpen(false)} loc={loc} />}
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
