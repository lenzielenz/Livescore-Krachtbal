import { createElement } from 'react'

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MatchWeather } from '@/components/MatchWeather'

// Het weer aan het veld als klein chipje in de kopregel van de wedstrijdpagina: icoon,
// temperatuur en de regenkans; een tik klapt de details open, ✕ klapt ze weer dicht.
// (Zonder JSX opgeschreven omdat de testconfiguratie enkel .ts-bestanden oppikt.)

const AFTRAP = new Date(Date.now() + 2 * 3600_000)
AFTRAP.setMinutes(0, 0, 0)

function uren() {
  const t: string[] = []
  for (let i = -3; i < 8; i++) {
    const d = new Date(AFTRAP.getTime() + i * 3600_000)
    const p = (n: number) => String(n).padStart(2, '0')
    t.push(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`)
  }
  return t
}

beforeEach(() => {
  const time = uren()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        hourly: {
          time,
          temperature_2m: time.map(() => 9),
          apparent_temperature: time.map(() => 6),
          precipitation: time.map(() => 0.1),
          precipitation_probability: time.map(() => 52),
          weather_code: time.map(() => 80),
          wind_speed_10m: time.map(() => 14),
          wind_gusts_10m: time.map(() => 22),
          wind_direction_10m: time.map(() => 225),
        },
      }),
    })) as unknown as typeof fetch,
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('weer aan het veld als chip', () => {
  it('toont temperatuur en regenkans, en klapt de details open en dicht', async () => {
    const { container } = render(createElement(MatchWeather, { date: AFTRAP.toISOString(), lat: 51.2, lng: 3.2, place: 'Brugge', variant: 'chip' }))
    const chip = await screen.findByRole('button', { name: /9°/ })
    expect(chip.textContent).toContain('52%')
    expect(container.querySelector('.mw-uit')).toBeNull()
    await act(async () => {
      chip.click()
    })
    await waitFor(() => expect(container.querySelector('.mw-uit .mw-hours')).toBeTruthy())
    await act(async () => {
      ;(screen.getByRole('button', { name: 'Weerbericht sluiten' }) as HTMLButtonElement).click()
    })
    expect(container.querySelector('.mw-uit')).toBeNull()
  })
})
