import { createElement } from 'react'

import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// De knop "zet dit scherm op de tv".
//
// Wat hier bewaakt wordt is vooral wat er over de lijn gaat: niet een videostroom maar het PAD van
// het scherm. De Chromecast laadt dat zelf, en houdt daardoor zijn eigen live verbinding — het
// scherm blijft draaien wanneer je je telefoon wegsteekt. Stuurt de knop het verkeerde pad, dan
// staat er een ander scherm op de tv en zie je dat hier pas in de kantine.
//
// (Zonder JSX opgeschreven omdat de testconfiguratie enkel .ts-bestanden oppikt.)

type Bericht = { namespace: string; data: { path: string } }

let verstuurd: Bericht[] = []
let sessieCallback: ((s: unknown) => void) | null = null

/** Een nagebouwde Cast-SDK: genoeg om de knop te laten werken zonder Chromecast in de kamer. */
function nepSdk(): void {
  const sessie = {
    receiver: { friendlyName: 'Chromecast kantine' },
    status: 'connected',
    addUpdateListener: () => {},
    sendMessage: (namespace: string, data: { path: string }) => {
      verstuurd.push({ namespace, data })
    },
    stop: (ok: () => void) => ok(),
  }
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    cast: {
      SessionRequest: class {},
      ApiConfig: class {},
      AutoJoinPolicy: { PAGE_SCOPED: 'page' },
      SessionStatus: { STOPPED: 'stopped' },
      initialize: (_c: unknown, ok: () => void) => ok(),
      requestSession: (ok: (s: unknown) => void) => {
        sessieCallback = ok
        ok(sessie)
      },
    },
  }
}

async function laadKnop() {
  // De App ID wordt op moduleniveau gelezen; stub hem dus vóór de import.
  vi.stubEnv('NEXT_PUBLIC_CAST_APP_ID', 'TEST1234')
  vi.resetModules()
  const mod = await import('@/components/CastKnop')
  return mod.CastKnop
}

/** Doet alsof dit een geïnstalleerde app is op het gegeven toestel. */
function zetAlsApp(ua: string) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('standalone'),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: ua })
}

beforeEach(() => {
  verstuurd = []
  sessieCallback = null
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  delete (globalThis as unknown as { chrome?: unknown }).chrome
})

describe('cast-knop', () => {
  it('blijft weg wanneer casten hier niet kan', async () => {
    // Geen Cast in de browser (Firefox op een laptop): dan tonen we geen knop die niets doet —
    // ook niet nadat we het opgegeven hebben op de SDK. Dit is meteen de bewaker voor de tv
    // zelf: daar draait dit scherm in de ontvanger, en daar hoort geen enkele knop op.
    const CastKnop = await laadKnop()
    const { container } = render(createElement(CastKnop, { pad: '/kantine/scherm' }))
    expect(container.querySelector('button')).toBeNull()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000)
    })
    expect(container.querySelector('button')).toBeNull()
  })

  it('biedt in de geïnstalleerde app de weg via Chrome aan, in plaats van te verdwijnen', async () => {
    // Dit is de aanleiding: Android laat `chrome.cast` niet toe in een geïnstalleerde app, dus wie
    // de app netjes installeerde zag de knop weggaan. Verdwijnen is hier het slechtste antwoord —
    // de kantine wil dat scherm nog steeds op de tv, en die weg bestaat wél.
    zetAlsApp('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120 Mobile Safari/537.36')
    const CastKnop = await laadKnop()
    const { container } = render(createElement(CastKnop, { pad: '/kantine/scherm' }))

    // Zolang de SDK nog kán komen, tonen we niets — anders knippert er een knop weg.
    expect(container.querySelector('button')).toBeNull()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000)
    })

    const knop = container.querySelector('button')!
    expect(knop.textContent).toContain('Naar de tv')
    act(() => {
      knop.click()
    })
    const link = container.querySelector('a')!
    expect(link.getAttribute('href')).toContain('package=com.android.chrome')
    expect(link.getAttribute('href')).toContain('/kantine/scherm')
  })

  it('belooft op een iPhone-app geen Chrome-knop die niets oplevert', async () => {
    zetAlsApp('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1')
    const CastKnop = await laadKnop()
    const { container } = render(createElement(CastKnop, { pad: '/kantine/scherm' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000)
    })
    act(() => {
      container.querySelector('button')!.click()
    })
    expect(container.querySelector('a')).toBeNull()
    // De link staat er wél voluit, zodat je ze op een ander toestel kan overnemen.
    expect(container.textContent).toContain('/kantine/scherm')
  })

  it('verschijnt zodra de Cast-SDK klaar is', async () => {
    nepSdk()
    const CastKnop = await laadKnop()
    const { container } = render(createElement(CastKnop, { pad: '/kantine/scherm' }))
    expect(container.querySelector('button')?.textContent).toContain('Naar de tv')
  })

  it('stuurt het pad van dít scherm door, niet een videostroom', async () => {
    nepSdk()
    const CastKnop = await laadKnop()
    const { container } = render(createElement(CastKnop, { pad: '/kantine/scherm' }))
    act(() => {
      container.querySelector('button')!.click()
    })
    expect(verstuurd[0]?.data.path).toBe('/kantine/scherm')
    expect(verstuurd[0]?.namespace).toContain('krachtbal')
  })

  it('herhaalt het bericht, want de tv is nog aan het opstarten', async () => {
    // De ontvanger laadt eerst zijn eigen SDK; een bericht dat daarvóór aankomt, hoort niemand.
    nepSdk()
    const CastKnop = await laadKnop()
    const { container } = render(createElement(CastKnop, { pad: '/kantine/scherm' }))
    act(() => {
      container.querySelector('button')!.click()
    })
    expect(verstuurd).toHaveLength(1)
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(verstuurd.length).toBeGreaterThanOrEqual(3)
    expect(verstuurd.every((b) => b.data.path === '/kantine/scherm')).toBe(true)
  })

  it('toont daarna welke tv meekijkt, met een stopknop', async () => {
    nepSdk()
    const CastKnop = await laadKnop()
    const { container } = render(createElement(CastKnop, { pad: '/kantine/scherm' }))
    act(() => {
      container.querySelector('button')!.click()
    })
    const knop = container.querySelector('button')!
    expect(knop.textContent).toContain('Stop casten')
    expect(knop.textContent).toContain('Chromecast kantine')

    act(() => {
      knop.click()
    })
    expect(container.querySelector('button')?.textContent).toContain('Naar de tv')
  })

  it('vraagt maar één keer om een toestel', async () => {
    // Een tweede tik hoort het pad opnieuw te sturen, niet een nieuwe toestelkiezer te openen.
    nepSdk()
    const CastKnop = await laadKnop()
    const { container } = render(createElement(CastKnop, { pad: '/tornooi/groep/Beker/kantine' }))
    act(() => {
      container.querySelector('button')!.click()
    })
    const eerste = sessieCallback
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(sessieCallback).toBe(eerste)
    expect(verstuurd[0]?.data.path).toBe('/tornooi/groep/Beker/kantine')
  })
})
