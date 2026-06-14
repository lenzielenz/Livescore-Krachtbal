'use client'

import { useEffect, useState } from 'react'

import './match-weather.css'

// Weerbericht aan het veld voor één wedstrijd: de uren rond de aftrap op de thuislocatie, met
// een klare conclusie (droog / mogelijk een bui / regen), temperatuur, gevoelstemperatuur, wind
// en regenkans per uur. Verving de kale mini-buienradar: krachtbal is een buitensport, dus ook
// wind en koude tellen — niet alleen regen. Data via Open-Meteo (gratis, geen sleutel,
// client-side). Coördinaten: exacte lat/lng van het terrein indien gezet, anders geocoderen op
// de gemeente.

const PRE_H = 1 // toon vanaf 1u vóór de aftrap (aankomst + opwarming)
const POST_H = 3 // urenstrip tot 3u na de aftrap (wedstrijd + uitloop)
const MATCH_H = 2 // het wedstrijdvenster zelf, voor de regen-conclusie
// Blijf zichtbaar tot ruim na de wedstrijd (napraatmoment, tribune sluit 1u na het einde).
const LINGER_MS = 3 * 3600_000

type Slot = {
  label: string
  emoji: string
  lbl: string
  temp: number
  feels: number
  prob: number
  mm: number
  wind: number
  gust: number
  dir: number
  kickoff: boolean
  inMatch: boolean
}
type Forecast = { slots: Slot[]; maxProb: number; sumMm: number; place: string | null }

// WMO-weercode → emoji + korte Nederlandse omschrijving.
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

// Windrichting (graden, vanwaar de wind komt) → Nederlandse windstreek.
function windStreek(deg: number): string {
  const streken = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW']
  return streken[Math.round(((deg % 360) + 360) % 360 / 45) % 8]
}

async function geocode(place: string): Promise<{ lat: number; lon: number } | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=5&language=nl&format=json`
  const res = await fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  const list = (res?.results ?? []) as { latitude: number; longitude: number; country_code?: string }[]
  if (!list.length) return null
  const be = list.find((r) => r.country_code === 'BE') ?? list[0]
  return { lat: be.latitude, lon: be.longitude }
}

export function MatchWeather({
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
  // Standaard ingeklapt — de matchpagina is druk; één rustig regeltje, uurdetail op aanvraag.
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setState('loading')

    const start = new Date(date)
    const now = Date.now()
    // Enkel zinvol vóór, tijdens en kort ná de wedstrijd, binnen het voorspelvenster (~14 dagen).
    const end = start.getTime() + POST_H * 3600_000
    if (Number.isNaN(start.getTime()) || end < now - LINGER_MS || start.getTime() > now + 14 * 864e5) {
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
      const windowStart = start.getTime() - PRE_H * 3600_000
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}` +
        `&hourly=temperature_2m,apparent_temperature,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m` +
        `&timezone=Europe%2FBrussels&start_date=${day(new Date(windowStart))}&end_date=${day(new Date(end))}`
      const d = await fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      if (cancelled) return
      const h = d?.hourly as {
        time?: string[]
        temperature_2m?: number[]
        apparent_temperature?: number[]
        precipitation?: number[]
        precipitation_probability?: (number | null)[]
        weather_code?: number[]
        wind_speed_10m?: number[]
        wind_gusts_10m?: number[]
        wind_direction_10m?: number[]
      } | undefined
      if (!h?.time?.length) {
        setState('none')
        return
      }
      const matchEnd = start.getTime() + MATCH_H * 3600_000
      const slots: Slot[] = []
      let maxProb = 0
      let sumMm = 0
      for (let i = 0; i < h.time.length; i++) {
        const t = new Date(h.time[i]) // lokale tijd (Brussels ~ gebruikerstijd in BE)
        const t0 = t.getTime()
        // Uur telt mee als het overlapt met [aftrap − 1u, aftrap + 3u].
        if (t0 + 3600_000 <= windowStart || t0 >= end) continue
        const prob = Number(h.precipitation_probability?.[i] ?? 0)
        const mm = Number(h.precipitation?.[i] ?? 0)
        const inMatch = t0 + 3600_000 > start.getTime() && t0 < matchEnd
        if (inMatch) {
          maxProb = Math.max(maxProb, prob)
          sumMm += mm
        }
        const desc = describe(Number(h.weather_code?.[i] ?? 0))
        slots.push({
          label: `${String(t.getHours()).padStart(2, '0')}u`,
          emoji: desc.emoji,
          lbl: desc.label,
          temp: Math.round(Number(h.temperature_2m?.[i] ?? 0)),
          feels: Math.round(Number(h.apparent_temperature?.[i] ?? h.temperature_2m?.[i] ?? 0)),
          prob,
          mm,
          wind: Math.round(Number(h.wind_speed_10m?.[i] ?? 0)),
          gust: Math.round(Number(h.wind_gusts_10m?.[i] ?? 0)),
          dir: Number(h.wind_direction_10m?.[i] ?? 0),
          kickoff: t0 <= start.getTime() && start.getTime() < t0 + 3600_000,
          inMatch,
        })
      }
      if (!slots.length) {
        setState('none')
        return
      }
      setFc({ slots, maxProb, sumMm: Math.round(sumMm * 10) / 10, place: place?.trim() || null })
      setState('ok')
    }
    run()
    return () => {
      cancelled = true
    }
  }, [date, lat, lng, place])

  if (state !== 'ok' || !fc) return null

  // Het uur van de aftrap is de blikvanger; de andere uren staan in de strip eronder.
  const hero = fc.slots.find((s) => s.kickoff) ?? fc.slots[0]
  // Na de wedstrijd (napraatmoment) schakelt de conclusie naar verleden tijd.
  const over = Date.now() > new Date(date).getTime() + MATCH_H * 3600_000
  // "Speelweer"-oordeel: geen kale regenfocus meer, maar een holistische conclusie voor een
  // buitensport — regen, wind, kou en hitte samen, met een ideaal-weer-uitkomst.
  const rainHeavy = fc.maxProb >= 60 || fc.sumMm >= 2
  const rainMaybe = fc.maxProb >= 30 || fc.sumMm >= 0.3
  const windStrong = hero.gust >= 50 || hero.wind >= 35
  const windMod = hero.gust >= 38 || hero.wind >= 25
  const cold = hero.feels <= 2
  const hot = hero.feels >= 29
  const verdict: { icon: string; text: string; short: string; cls: string } = rainHeavy
    ? { icon: '🌧️', text: over ? 'Regen tijdens de wedstrijd' : 'Grote kans op regen', short: over ? 'Regen gevallen' : 'Kans op regen', cls: 'wet' }
    : windStrong
      ? { icon: '💨', text: over ? 'Het was stevig winderig' : 'Stevige wind — let op hoge worpen', short: 'Stevige wind', cls: 'windy' }
      : rainMaybe
        ? { icon: '🌦️', text: over ? 'Mogelijk een bui gehad' : 'Mogelijk een bui', short: 'Mogelijk een bui', cls: 'maybe' }
        : cold
          ? { icon: '🥶', text: over ? 'Het was koud' : 'Koud — kleed je warm aan', short: 'Koud', cls: 'cold' }
          : hot
            ? { icon: '🥵', text: over ? 'Het was warm' : 'Warm — drink voldoende', short: 'Warm', cls: 'hot' }
            : windMod
              ? { icon: '🌬️', text: over ? 'Het was een frisse bries' : 'Frisse bries', short: 'Frisse bries', cls: 'windy' }
              : hero.feels >= 8 && hero.feels <= 26
                ? { icon: hero.emoji, text: over ? 'Het was ideaal speelweer' : 'Ideaal speelweer', short: 'Ideaal weer', cls: 'great' }
                : { icon: hero.emoji, text: over ? 'Het bleef droog' : 'Droog verwacht', short: over ? 'Bleef droog' : 'Droog', cls: 'dry' }
  // Stevige rukwinden zijn aan het veld voelbaar — enkel tonen wanneer ze er echt toe doen.
  const gustWorthy = hero.gust >= 40 && hero.gust >= hero.wind + 10
  const shortVerdict = verdict.short
  // De meest relevante kerncijfer naast de samenvatting: regen → wind → kou.
  const summaryChip = rainHeavy || rainMaybe || hero.prob >= 20 || hero.mm > 0
    ? { ico: '☔', val: `${fc.maxProb}%` }
    : windStrong || windMod
      ? { ico: '💨', val: `${hero.wind} km/u` }
      : cold
        ? { ico: '🥶', val: `${hero.feels}°` }
        : null

  return (
    <section className={`mw mw-c ${verdict.cls}`} aria-label="Weerbericht aan het veld">
      {/* Ingeklapte samenvatting: één rustig regeltje dat past op een drukke matchpagina. */}
      <button type="button" className="mw-sum" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="mw-sum-ico" aria-hidden>{hero.emoji}</span>
        <span className="mw-sum-temp">{hero.temp}°</span>
        <span className="mw-sum-txt">{shortVerdict}</span>
        {summaryChip && <span className="mw-sum-rain">{summaryChip.ico} {summaryChip.val}</span>}
        {fc.place && <span className="mw-sum-place">📍 {fc.place}</span>}
        <span className="mw-sum-chev" aria-hidden>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="mw-detail">
          <div className="mw-hero-facts">
            <span className="mw-fact">
              <span className="mw-fact-ico" aria-hidden>🌡️</span>
              {hero.temp}°{hero.feels !== hero.temp ? ` · voelt als ${hero.feels}°` : ''}
            </span>
            <span className="mw-fact">
              <span className="mw-fact-ico" aria-hidden>💨</span>
              {hero.wind} km/u {windStreek(hero.dir)}
              <span className="mw-wind-arrow" aria-hidden style={{ transform: `rotate(${hero.dir + 180}deg)` }}>↑</span>
            </span>
            {gustWorthy && (
              <span className="mw-fact mw-fact-warn">
                <span className="mw-fact-ico" aria-hidden>🌬️</span>rukwinden tot {hero.gust} km/u
              </span>
            )}
            {(hero.prob >= 20 || hero.mm > 0) && (
              <span className="mw-fact">
                <span className="mw-fact-ico" aria-hidden>☔</span>
                {hero.prob}%{hero.mm > 0 ? ` · ${hero.mm} mm` : ''}
              </span>
            )}
          </div>

          <div className="mw-verdict">
            <span aria-hidden>{verdict.icon}</span>
            <span>{verdict.text}</span>
            {fc.sumMm > 0 && <span className="mw-verdict-mm" title="Verwachte neerslag tijdens de wedstrijd">{fc.sumMm} mm</span>}
          </div>

          <div className="mw-hours">
            {fc.slots.map((s, i) => (
              <span className={`mw-hour ${s.kickoff ? 'kickoff' : ''}`} key={i} title={`${s.label}: ${s.temp}° · ${s.prob}% kans op neerslag · ${s.wind} km/u wind`}>
                <span className="mw-hour-time">{s.kickoff ? '🏁 ' : ''}{s.label}</span>
                <span className="mw-hour-ico" aria-hidden>{s.emoji}</span>
                <span className="mw-hour-temp">{s.temp}°</span>
                <span className="mw-hour-bar"><i style={{ width: `${s.prob}%` }} /></span>
                <span className="mw-hour-prob">{s.prob >= 10 ? `${s.prob}%` : '·'}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
