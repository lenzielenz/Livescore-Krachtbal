import { renderHook } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fmtClock, useLiveClock } from '@/lib/use-live-clock'

// De klok tikt zelfcorrigerend op de volgende hele secondegrens i.p.v. blind om de 250ms te
// pollen — dat vaste interval was de bron van de "seconde slaat over"-hik (zie use-live-clock.ts).
describe('useLiveClock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('staat stil zolang de klok niet loopt', () => {
    const { result } = renderHook(() => useLiveClock({ seconds: 42, running: false, updatedAt: null }))
    expect(result.current).toBe(42)
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(result.current).toBe(42)
  })

  it('toont elke hele seconde tussen 0 en 5, geen enkele overgeslagen', () => {
    const start = Date.now()
    const { result } = renderHook(() => useLiveClock({ seconds: 0, running: true, updatedAt: new Date(start).toISOString() }))

    const seen: number[] = [Math.floor(result.current)]
    for (let i = 0; i < 5; i++) {
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      seen.push(Math.floor(result.current))
    }
    expect(seen).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('loopt niet achterop en slaat niets over bij een trage (jank-)tik', () => {
    // Simuleert een hoofdthread die 2,4s te laat aan de volgende tik toekomt (SSE-payload, her-render,
    // ...). De klok zelf blijft correct: op t=6s toont ze 6, niet 5 of 8.
    const start = Date.now()
    const { result } = renderHook(() => useLiveClock({ seconds: 0, running: true, updatedAt: new Date(start).toISOString() }))

    act(() => {
      vi.advanceTimersByTime(6000)
    })
    expect(Math.floor(result.current)).toBe(6)
  })

  it('herstart de basis wanneer de server een nieuwe stand + updatedAt doorgeeft', () => {
    const start = Date.now()
    const { result, rerender } = renderHook(
      ({ seconds, updatedAt }: { seconds: number; updatedAt: string }) => useLiveClock({ seconds, running: true, updatedAt }),
      { initialProps: { seconds: 0, updatedAt: new Date(start).toISOString() } },
    )
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(Math.floor(result.current)).toBe(3)

    // Server meldt: 100s bij dit (latere) tijdstip — de klok moet daar meteen vanaf verder tikken,
    // niet vanaf de oude basis.
    rerender({ seconds: 100, updatedAt: new Date(Date.now()).toISOString() })
    expect(Math.floor(result.current)).toBe(100)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(Math.floor(result.current)).toBe(102)
  })

  it('klemt tegen een bovengrens (weggelopen-klok-bescherming)', () => {
    const start = Date.now()
    const { result } = renderHook(() => useLiveClock({ seconds: 0, running: true, updatedAt: new Date(start).toISOString(), max: 5 }))
    act(() => {
      vi.advanceTimersByTime(20_000)
    })
    expect(result.current).toBe(5)
  })
})

describe('fmtClock', () => {
  it('formatteert als mm:ss, geklemd op nul', () => {
    expect(fmtClock(0)).toBe('00:00')
    expect(fmtClock(65)).toBe('01:05')
    expect(fmtClock(-5)).toBe('00:00')
  })
})
