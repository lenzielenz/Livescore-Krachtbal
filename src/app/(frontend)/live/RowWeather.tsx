'use client'

import { useEffect, useState } from 'react'

// Compacte weer-indicator per wedstrijd op het live-bord: temperatuur + (regen)icoon op het uur van
// de aftrap, op de thuislocatie. Data via Open-Meteo (gratis, geen sleutel). Per locatie wordt de
// voorspelling één keer opgehaald en gedeeld tussen alle wedstrijden op die plaats (cache).

type Hourly = { time: string[]; temperature_2m: number[]; precipitation_probability: number[]; weathercode: number[] }
const cache = new Map<string, Promise<Hourly | null>>()

async function geocode(place: string): Promise<{ lat: number; lon: number } | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=5&language=nl&format=json`
  const res = await fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  const list = (res?.results ?? []) as { latitude: number; longitude: number; country_code?: string }[]
  if (!list.length) return null
  const be = list.find((r) => r.country_code === 'BE') ?? list[0]
  return { lat: be.latitude, lon: be.longitude }
}

async function loadHourly(key: string, lat: number | null, lng: number | null, plaats: string | null): Promise<Hourly | null> {
  let coords = lat != null && lng != null ? { lat, lon: lng } : null
  if (!coords && plaats) coords = await geocode(plaats)
  if (!coords) return null
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}` +
    `&hourly=temperature_2m,precipitation_probability,weathercode&forecast_days=16&timezone=Europe%2FBrussels`
  const data = await fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  return (data?.hourly as Hourly) ?? null
}

// WMO-weercode → emoji (vereenvoudigd).
function icon(code: number, prob: number): string {
  if (code >= 95) return '⛈️'
  if (code >= 71 && code <= 77) return '🌨️'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || prob >= 60) return '🌧️'
  if (code >= 45 && code <= 48) return '🌫️'
  if (code === 3) return '☁️'
  if (code === 1 || code === 2) return '🌤️'
  return '☀️'
}

export function RowWeather({
  kickoff,
  plaats,
  lat,
  lng,
}: {
  kickoff: string
  plaats: string | null
  lat: number | null
  lng: number | null
}) {
  const [out, setOut] = useState<{ temp: number; prob: number; code: number } | null>(null)

  useEffect(() => {
    const start = new Date(kickoff)
    const t = start.getTime()
    if (Number.isNaN(t)) return
    // Enkel binnen het voorspelvenster (~15 dagen vooruit, tot ~3u ná de aftrap).
    const now = Date.now()
    if (t > now + 15 * 864e5 || t < now - 3 * 3600_000) return
    if (lat == null && lng == null && !plaats) return

    const key = lat != null && lng != null ? `c:${lat},${lng}` : `p:${plaats}`
    let cancelled = false
    let p = cache.get(key)
    if (!p) {
      p = loadHourly(key, lat, lng, plaats)
      cache.set(key, p)
    }
    p.then((hourly) => {
      if (cancelled || !hourly?.time?.length) return
      // Uur van de aftrap (Brussel) → "YYYY-MM-DDTHH:00" matcht de Open-Meteo-uurlijst.
      const hourKey = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Brussels',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
        hourCycle: 'h23',
      })
        .format(start)
        .replace(' ', 'T')
        .replace(/:\d\d$/, ':00')
      let i = hourly.time.indexOf(hourKey)
      if (i < 0) i = hourly.time.findIndex((tt) => tt >= hourKey)
      if (i < 0) i = 0
      setOut({ temp: Math.round(hourly.temperature_2m[i]), prob: hourly.precipitation_probability?.[i] ?? 0, code: hourly.weathercode?.[i] ?? 0 })
    })
    return () => {
      cancelled = true
    }
  }, [kickoff, plaats, lat, lng])

  if (!out) return null
  return (
    <span className="lb-weather" title={`Weer rond de aftrap${plaats ? ` · ${plaats}` : ''}`}>
      <span className="lb-weather-ico" aria-hidden>{icon(out.code, out.prob)}</span>
      <span className="lb-weather-t">{out.temp}°</span>
      {out.prob >= 30 && <span className="lb-weather-p">{out.prob}%</span>}
    </span>
  )
}
