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

beforeEach(() => {
  verstuurd = []
  sessieCallback = null
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllEnvs()
  delete (globalThis as unknown as { chrome?: unknown }).chrome
})

describe('cast-knop', () => {
  it('blijft weg wanneer casten hier niet kan', async () => {
    // Geen Cast in de browser (iPhone, Firefox): dan tonen we geen knop die niets doet.
    const CastKnop = await laadKnop()
    const { container } = render(createElement(CastKnop, { pad: '/kantine/scherm' }))
    expect(container.querySelector('button')).toBeNull()
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
