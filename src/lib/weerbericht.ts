// Het uitgebreide weerbericht achter de weerchip in de sitekop (components/Weerbericht.tsx).
//
// Puur en zonder netwerk: dit zet het antwoord van Open-Meteo om in wat het scherm toont (de
// weerscène, het "nu"-blok, de komende uren en dagen) en in één zin speeladvies. Zo is het te
// testen zonder browser, en blijft de component zelf enkel tekenen.

/** Welke bewegende scène het weerbericht bovenaan toont. */
export type Scene = 'helder' | 'halfbewolkt' | 'bewolkt' | 'mist' | 'motregen' | 'regen' | 'sneeuw' | 'onweer'

/** WMO-weercode (Open-Meteo) → scène. */
export function sceneVoor(code: number): Scene {
  if (code === 0) return 'helder'
  if (code <= 2) return 'halfbewolkt'
  if (code === 3) return 'bewolkt'
  if (code === 45 || code === 48) return 'mist'
  if (code >= 51 && code <= 57) return 'motregen'
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'regen'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'sneeuw'
  if (code >= 95) return 'onweer'
  return 'halfbewolkt'
}

/** Korte omschrijving + emoji (ook voor de kleine chip en de urenstrip). */
export function omschrijving(code: number, isDag = true): { emoji: string; label: string } {
  if (code === 0) return { emoji: isDag ? '☀️' : '🌙', label: 'Helder' }
  if (code <= 2) return { emoji: isDag ? '🌤️' : '☁️', label: 'Licht bewolkt' }
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

export type Nu = {
  temp: number
  voeltAls: number
  code: number
  isDag: boolean
  wind: number
  windstoten: number
  windRichting: number | null
  vochtigheid: number | null
  neerslag: number
}
export type Uur = { tijd: string; label: string; code: number; isDag: boolean; temp: number; kans: number; wind: number; windRichting: number | null }
export type Dag = { datum: string; label: string; code: number; max: number; min: number; kans: number }
export type Weerbericht = { nu: Nu; uren: Uur[]; dagen: Dag[]; zon: { op: string | null; onder: string | null } }

type Reeks = Record<string, (number | string | null)[] | undefined>
export type OpenMeteoAntwoord = {
  current?: Record<string, number | string | null | undefined>
  hourly?: Reeks
  daily?: Reeks
}

const getal = (v: unknown, terug = 0): number => {
  const n = Number(v)
  return v == null || !Number.isFinite(n) ? terug : n
}
const ofNull = (v: unknown): number | null => {
  const n = Number(v)
  return v == null || !Number.isFinite(n) ? null : n
}

const WEEKDAG = new Intl.DateTimeFormat('nl-BE', { weekday: 'short', timeZone: 'UTC' })

/** "2026-11-07" → "za" (of Vandaag/Morgen t.o.v. `vandaag`). */
export function dagLabel(datum: string, vandaag: string): string {
  if (datum === vandaag) return 'Vandaag'
  const d = new Date(`${datum}T12:00:00Z`)
  const morgen = new Date(`${vandaag}T12:00:00Z`)
  morgen.setUTCDate(morgen.getUTCDate() + 1)
  if (datum === morgen.toISOString().slice(0, 10)) return 'Morgen'
  const w = WEEKDAG.format(d).replace('.', '')
  return w.charAt(0).toUpperCase() + w.slice(1)
}

/**
 * Zet het Open-Meteo-antwoord om. De tijden van Open-Meteo zijn lokale Belgische tijd zonder
 * zone ("2026-11-07T14:00"); we vergelijken ze als tekst met `current.time`, zodat de tijdzone
 * van het toestel er niets toe doet.
 */
export function bouwWeerbericht(d: OpenMeteoAntwoord, aantalUren = 12): Weerbericht | null {
  const c = d.current
  if (!c || c.temperature_2m == null) return null
  const nuTijd = String(c.time ?? '')
  const nu: Nu = {
    temp: Math.round(getal(c.temperature_2m)),
    voeltAls: Math.round(getal(c.apparent_temperature, getal(c.temperature_2m))),
    code: getal(c.weather_code),
    isDag: getal(c.is_day, 1) === 1,
    wind: Math.round(getal(c.wind_speed_10m)),
    windstoten: Math.round(getal(c.wind_gusts_10m, getal(c.wind_speed_10m))),
    windRichting: ofNull(c.wind_direction_10m),
    vochtigheid: ofNull(c.relative_humidity_2m),
    neerslag: getal(c.precipitation),
  }

  const h = d.hourly ?? {}
  const tijden = (h.time ?? []).map(String)
  const uurNu = nuTijd.slice(0, 13) // "2026-11-07T14"
  const uren: Uur[] = []
  for (let i = 0; i < tijden.length && uren.length < aantalUren; i++) {
    if (uurNu && tijden[i].slice(0, 13) < uurNu) continue
    uren.push({
      tijd: tijden[i],
      label: uren.length === 0 ? 'Nu' : `${tijden[i].slice(11, 13)}u`,
      code: getal(h.weather_code?.[i]),
      isDag: getal(h.is_day?.[i], 1) === 1,
      temp: Math.round(getal(h.temperature_2m?.[i])),
      kans: Math.round(getal(h.precipitation_probability?.[i])),
      wind: Math.round(getal(h.wind_speed_10m?.[i])),
      windRichting: ofNull(h.wind_direction_10m?.[i]),
    })
  }

  const dd = d.daily ?? {}
  const datums = (dd.time ?? []).map(String)
  const vandaag = nuTijd.slice(0, 10) || datums[0] || ''
  const dagen: Dag[] = datums.map((datum, i) => ({
    datum,
    label: dagLabel(datum, vandaag),
    code: getal(dd.weather_code?.[i]),
    max: Math.round(getal(dd.temperature_2m_max?.[i])),
    min: Math.round(getal(dd.temperature_2m_min?.[i])),
    kans: Math.round(getal(dd.precipitation_probability_max?.[i])),
  }))
  const uurUit = (v: unknown) => (typeof v === 'string' && v.length >= 16 ? v.slice(11, 16) : null)
  return { nu, uren, dagen, zon: { op: uurUit(dd.sunrise?.[0]), onder: uurUit(dd.sunset?.[0]) } }
}

/**
 * Eén zin speeladvies: wat betekent dit weer op een krachtbalveld? Het belangrijkste eerst —
 * onweer gaat voor alles, dan sneeuw, dan wind (die verlegt lange worpen), dan regen, dan
 * temperatuur.
 */
export function speeladvies(nu: Nu, kansKomendeUren: number): { emoji: string; tekst: string } {
  if (sceneVoor(nu.code) === 'onweer') return { emoji: '⚡', tekst: 'Onweer in de buurt: let op de veiligheid op het veld.' }
  if (sceneVoor(nu.code) === 'sneeuw') return { emoji: '❄️', tekst: 'Sneeuw: glad veld en koude handen, goed opwarmen.' }
  const wind = Math.max(nu.wind, Math.round(nu.windstoten * 0.7))
  if (wind >= 29) return { emoji: '💨', tekst: 'Krachtige wind: lange worpen worden flink verlegd.' }
  if (wind >= 20) return { emoji: '🌬️', tekst: 'Merkbare wind: hou rekening met afwijking bij lange worpen.' }
  if (nu.neerslag > 0.2 || kansKomendeUren >= 60) return { emoji: '💧', tekst: 'Natte bal en glad veld: extra grip nodig.' }
  if (nu.temp <= 3) return { emoji: '🥶', tekst: 'Koud: goed opwarmen voor de aftrap.' }
  if (nu.temp >= 27) return { emoji: '🥤', tekst: 'Warm: drink voldoende tussen de helften.' }
  return { emoji: '✅', tekst: 'Prima krachtbalweer.' }
}

/** De punten van de temperatuurlijn over de urenstrip (SVG, viewBox breedte × hoogte). */
export function temperatuurLijn(temps: number[], breedte: number, hoogte: number, marge = 6): { x: number; y: number }[] {
  if (temps.length === 0) return []
  const min = Math.min(...temps)
  const max = Math.max(...temps)
  const bereik = max - min || 1
  const stap = breedte / temps.length
  return temps.map((t, i) => ({
    x: stap * (i + 0.5),
    y: marge + (1 - (t - min) / bereik) * (hoogte - 2 * marge),
  }))
}
