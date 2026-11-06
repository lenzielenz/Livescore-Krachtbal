import { createElement } from 'react'

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WeatherWidget } from '@/components/WeatherWidget'

// Het weerbericht in de kopbalk: opengaan, wind tonen, en netjes weer dichtgaan.
//
// De melding: "eens de dropdown is en je klikt er naast, dan gaat die niet mooi weg." Er stond
// geen enkele overgang op, en Escape deed niets. Dit legt het gedrag vast zonder de echte
// weerdienst te bevragen — die is vanuit een test toch niet bereikbaar.
//
// (Zonder JSX opgeschreven omdat de testconfiguratie enkel .ts-bestanden oppikt.)

const DAG = {
  daily: {
    weather_code: [1],
    temperature_2m_max: [21],
    temperature_2m_min: [13],
    wind_speed_10m_max: [18],
  },
}

// Het uitgebreide weerbericht (components/Weerbericht.tsx) haalt nu, uren en dagen in één keer op.
const BERICHT = {
  current: {
    time: '2026-11-07T14:15',
    temperature_2m: 19,
    apparent_temperature: 18,
    weather_code: 1,
    is_day: 1,
    wind_speed_10m: 22,
    wind_gusts_10m: 30,
    wind_direction_10m: 225,
    relative_humidity_2m: 70,
    precipitation: 0,
  },
  hourly: {
    time: ['2026-11-07T14:00', '2026-11-07T15:00'],
    temperature_2m: [19, 20],
    weather_code: [1, 1],
    precipitation_probability: [40, 20],
    wind_speed_10m: [22, 24],
    wind_direction_10m: [225, 230],
    is_day: [1, 1],
  },
  daily: { time: ['2026-11-07'], weather_code: [1], temperature_2m_max: [21], temperature_2m_min: [13], precipitation_probability_max: [40] },
}

const compact = () => render(createElement(WeatherWidget, { variant: 'compact' }))

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('my-weather-place')) {
        return { ok: true, json: async () => ({ lat: 51, lon: 3, place: 'Brugge' }) }
      }
      if (url.includes('current=')) return { ok: true, json: async () => BERICHT }
      return { ok: true, json: async () => DAG }
    }) as unknown as typeof fetch,
  )
})

afterEach(() => {
  // Zonder expliciete opruiming stapelen de gerenderde widgets op en vindt de volgende test
  // twee weerchips in plaats van één.
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('weerbericht in de kopbalk', () => {
  it('toont de wind in het weerbericht', async () => {
    compact()
    const chip = await screen.findByRole('button', { name: /21/ })
    await act(async () => {
      chip.click()
    })
    // De windtegel: richting én wat de snelheid betekent, plus het speeladvies dat erbij hoort.
    await waitFor(() => expect(screen.getByText(/uit ZW · vrij krachtig/)).toBeTruthy())
    expect(screen.getByText(/Merkbare wind/)).toBeTruthy()
  })

  it('vaagt weg bij een klik ernaast in plaats van te verdwijnen', async () => {
    const { container } = compact()
    const chip = await screen.findByRole('button', { name: /21/ })
    await act(async () => {
      chip.click()
    })
    await waitFor(() => expect(container.querySelector('.wx-pop')).toBeTruthy())

    vi.useFakeTimers()
    const achtergrond = container.querySelector('.wx-pop-backdrop') as HTMLElement
    act(() => {
      achtergrond.click()
    })
    // Eerst nog zichtbaar, maar aan het sluiten — dát is het verschil met een harde sprong.
    expect(container.querySelector('.wx-pop.dicht')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(container.querySelector('.wx-pop')).toBeNull()
  })

  it('sluit ook met Escape', async () => {
    const { container } = compact()
    const chip = await screen.findByRole('button', { name: /21/ })
    await act(async () => {
      chip.click()
    })
    await waitFor(() => expect(container.querySelector('.wx-pop')).toBeTruthy())

    vi.useFakeTimers()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      vi.advanceTimersByTime(300)
    })
    expect(container.querySelector('.wx-pop')).toBeNull()
  })
})
