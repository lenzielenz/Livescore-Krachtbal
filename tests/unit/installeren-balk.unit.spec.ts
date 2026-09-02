import { createElement } from 'react'

import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Installeren } from '@/components/Installeren'
import { RUST_SLEUTEL } from '@/lib/installeren'

// De installatiebalk.
//
// De logica van "wanneer tonen we iets" staat in installeren.unit.spec.ts; hier wordt de BEDRADING
// bewaakt, want daar zitten de valkuilen: het `beforeinstallprompt`-event moet tegengehouden worden
// (anders neemt Chrome het over met zijn eigen mini-balkje en gebeurt er bij ons niets), en de balk
// moet verdwijnen zodra de app geïnstalleerd is — anders staat een geïnstalleerde app te vragen om
// zichzelf te installeren.
//
// (Zonder JSX opgeschreven omdat de testconfiguratie enkel .ts-bestanden oppikt.)

/** Bouwt een `beforeinstallprompt` na, inclusief het antwoord dat de gebruiker straks geeft. */
function nepUitnodiging(keuze: 'accepted' | 'dismissed' = 'accepted') {
  // `cancelable` moet expliciet: een gewoon Event is dat niet, en dan is preventDefault een
  // stille no-op. Het echte beforeinstallprompt ís annuleerbaar — daar draait de hele truc om.
  const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
    getoond: boolean
  }
  e.getoond = false
  e.prompt = async () => {
    e.getoond = true
  }
  e.userChoice = Promise.resolve({ outcome: keuze })
  return e
}

function zetOmgeving(opts: { ios?: boolean; standalone?: boolean } = {}) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: Boolean(opts.standalone) && q.includes('standalone'),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value: opts.ios ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari' : 'Mozilla/5.0 (Linux; Android 14) Chrome',
  })
}

beforeEach(() => {
  localStorage.clear()
  zetOmgeving()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Installeren', () => {
  it('toont niets tot de browser een installatie aanbiedt', () => {
    const { container } = render(createElement(Installeren))
    expect(container.textContent).toBe('')
  })

  it('houdt het event tegen en toont de balk met een installeerknop', () => {
    render(createElement(Installeren))
    const e = nepUitnodiging()
    act(() => {
      window.dispatchEvent(e)
    })
    // Zonder preventDefault toont Chrome zijn eigen balkje en zien wij de uitnodiging nooit terug.
    expect(e.defaultPrevented).toBe(true)
    expect(document.body.textContent).toContain('beginscherm')
    expect(knop('Installeren')).toBeTruthy()
  })

  it('opent het installatievenster bij een tik op de knop', async () => {
    render(createElement(Installeren))
    const e = nepUitnodiging('accepted')
    act(() => {
      window.dispatchEvent(e)
    })
    await act(async () => {
      knop('Installeren')!.click()
    })
    expect(e.getoond).toBe(true)
    // Toegestemd: de balk heeft zijn werk gedaan.
    expect(knop('Installeren')).toBeFalsy()
  })

  it('onthoudt een geweigerd installatievenster als wegklikken', async () => {
    render(createElement(Installeren))
    act(() => {
      window.dispatchEvent(nepUitnodiging('dismissed'))
    })
    await act(async () => {
      knop('Installeren')!.click()
    })
    expect(knop('Installeren')).toBeFalsy()
    // "Nee" mag niet betekenen dat de vraag bij de volgende paginalading terugkomt.
    expect(localStorage.getItem(RUST_SLEUTEL)).toBeTruthy()
  })

  it('verdwijnt zodra de app geïnstalleerd is', () => {
    render(createElement(Installeren))
    act(() => {
      window.dispatchEvent(nepUitnodiging())
    })
    expect(knop('Installeren')).toBeTruthy()
    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })
    expect(document.body.textContent).not.toContain('beginscherm')
  })

  it('legt op iPhone de twee stappen uit, zonder installatie-event', () => {
    zetOmgeving({ ios: true })
    render(createElement(Installeren))
    expect(document.body.textContent).toContain('beginscherm')
    expect(knop('Installeren')).toBeFalsy()

    act(() => {
      knop('Hoe?')!.click()
    })
    expect(document.body.textContent).toContain('Deel')
    expect(document.body.textContent).toContain('Zet op beginscherm')
  })

  it('zwijgt in een app die al geïnstalleerd is', () => {
    zetOmgeving({ ios: true, standalone: true })
    const { container } = render(createElement(Installeren))
    expect(container.textContent).toBe('')
  })

  it('blijft weg na het wegklikken', () => {
    const eerste = render(createElement(Installeren))
    act(() => {
      window.dispatchEvent(nepUitnodiging())
    })
    act(() => {
      knop('Niet nu')!.click()
    })
    expect(document.body.textContent).not.toContain('beginscherm')
    eerste.unmount()

    // Volgend bezoek: het event komt opnieuw, maar de balk hoort te zwijgen.
    render(createElement(Installeren))
    act(() => {
      window.dispatchEvent(nepUitnodiging())
    })
    expect(knop('Installeren')).toBeFalsy()
  })
})

/** Zoekt een knop op zijn opschrift of toegankelijke naam. */
function knop(tekst: string): HTMLButtonElement | null {
  const alle = Array.from(document.querySelectorAll('button'))
  return (
    (alle.find((b) => b.textContent?.trim() === tekst || b.getAttribute('aria-label') === tekst) as
      | HTMLButtonElement
      | undefined) ?? null
  )
}
