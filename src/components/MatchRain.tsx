'use client'

import { useEffect, useState } from 'react'

import './match-rain.css'

// Mini-buienradar voor één wedstrijd: hoeveel regen valt er op de thuislocatie tijdens het
// 2-uursvenster rond de aftrap? Data via Open-Meteo (gratis, geen sleutel, client-side).
// Coördinaten: exacte lat/lng van het terrein indien gezet, anders geocoderen op de gemeente.

const WINDOW_H = 2

type Slot = { label: string; mm: number; prob: number }
type Forecast = { slots: Slot[]; maxProb: number; sumMm: number }

async function geocode(place: string): Promise<{ lat: number; lon: number } | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=5&language=nl&format=json`
  const res = await fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  const list = (res?.results ?? []) as { latitude: number; longitude: number; country_code?: string }[]
  if (!list.length) return null
  const be = list.find((r) => r.country_code === 'BE') ?? list[0]
  return { lat: be.latitude, lon: be.longitude }
}

export function MatchRain({
  date,
  lat,
  lng,
  place,
}: {
  date: string
  lat?: number | null
  lng?: number | null
  place?: string | null
}) {
  const [fc, setFc] = useState<Forecast | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'none'>('loading')

  useEffect(() => {
    let cancelled = false
    setState('loading')

    const start = new Date(date)
    const now = Date.now()
    // Enkel zinvol vóór/rond de wedstrijd en binnen het voorspelvenster (~14 dagen).
    const end = start.getTime() + WINDOW_H * 3600_000
    if (Number.isNaN(start.getTime()) || end < now - 3600_000 || start.getTime() > now + 14 * 864e5) {
      setState('none')
      return
    }

    const run = async () => {
      let coords: { lat: number; lon: number } | null =
        typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
          ? { lat, lon: lng }
          : null
      if (!coords && place && place.trim()) coords = await geocode(place.trim())
      if (cancelled) return
      if (!coords) {
        setState('none')
        return
      }
      const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const endDate = new Date(end)
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}` +
        `&hourly=precipitation,precipitation_probability&timezone=Europe%2FBrussels` +
        `&start_date=${day(start)}&end_date=${day(endDate)}`
      const d = await fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      if (cancelled) return
      const h = d?.hourly as { time?: string[]; precipitation?: number[]; precipitation_probability?: (number | null)[] } | undefined
      if (!h?.time?.length) {
        setState('none')
        return
      }
      const slots: Slot[] = []
      let maxProb = 0
      let sumMm = 0
      for (let i = 0; i < h.time.length; i++) {
        const t = new Date(h.time[i]) // lokale tijd (Brussels ~ gebruikerstijd in BE)
        // Uur valt binnen het venster als het overlapt met [start, start+2u].
        if (t.getTime() + 3600_000 <= start.getTime() || t.getTime() >= end) continue
        const mm = Number(h.precipitation?.[i] ?? 0)
        const prob = Number(h.precipitation_probability?.[i] ?? 0)
        slots.push({ label: `${String(t.getHours()).padStart(2, '0')}u`, mm, prob })
        maxProb = Math.max(maxProb, prob)
        sumMm += mm
      }
      if (!slots.length) {
        setState('none')
        return
      }
      setFc({ slots, maxProb, sumMm: Math.round(sumMm * 10) / 10 })
      setState('ok')
    }
    run()
    return () => {
      cancelled = true
    }
  }, [date, lat, lng, place])

  if (state !== 'ok' || !fc) return null

  const verdict =
    fc.maxProb >= 60 || fc.sumMm >= 2
      ? { icon: '🌧️', text: 'Grote kans op regen tijdens de wedstrijd', cls: 'wet' }
      : fc.maxProb >= 30 || fc.sumMm >= 0.3
        ? { icon: '🌦️', text: 'Mogelijk een bui tijdens de wedstrijd', cls: 'maybe' }
        : { icon: '🌤️', text: 'Droog verwacht tijdens de wedstrijd', cls: 'dry' }

  return (
    <div className={`mr ${verdict.cls}`}>
      <span className="mr-icon" aria-hidden>{verdict.icon}</span>
      <div className="mr-body">
        <div className="mr-top">
          <span className="mr-verdict">{verdict.text}</span>
          {fc.sumMm > 0 && <span className="mr-sum" title="Verwachte neerslag rond de aftrap">{fc.sumMm} mm</span>}
        </div>
        <div className="mr-hours">
          {fc.slots.map((s, i) => (
            <span className="mr-hour" key={i} title={`${s.label}: ${s.prob}% kans · ${s.mm} mm`}>
              <span className="mr-hour-bar"><i style={{ width: `${s.prob}%` }} /></span>
              <span className="mr-hour-meta">{s.prob}% · {s.label}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
