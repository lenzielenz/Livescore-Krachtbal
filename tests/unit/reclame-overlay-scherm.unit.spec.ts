import { createElement } from 'react'

import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ReclameOverlay } from '@/components/ReclameOverlay'
import { DEFAULT_UITSNEDE } from '@/lib/reclame'
import { OVERLAY_MS, TUSSENTIJD_MS } from '@/lib/reclame-overlay'

// De reclame die af en toe het scherm overneemt.
//
// Met echte tijd duurt één ronde tien minuten; met een geknepen klok is het in een oogwenk te
// controleren. Wat hier vastligt: ze komt, ze blijft vijftien seconden, ze gaat weer weg, en
// daarna komt de volgende — want een balk die na één sponsor stopt is stuk zonder dat iemand het
// merkt.
//
// (Zonder JSX opgeschreven omdat de testconfiguratie enkel .ts-bestanden oppikt.)

const ad = (id: number) => ({
  id,
  url: `data:image/gif;base64,R0lGODlhAQABAAAAACw=#${id}`,
  naam: `Sponsor ${id}`,
  uitsnede: DEFAULT_UITSNEDE,
  achtergrond: 'donker' as const,
})

const overlay = (n: number) =>
  render(createElement(ReclameOverlay, { ads: Array.from({ length: n }, (_, i) => ad(i + 1)) }))

// De wachttijd schommelt met opzet rond de tien minuten. In een test wil je dat niet: met een
// vaste toevalsbron is de wachttijd exact de tussentijd, en kan je precies tot nét erna spoelen.
// (Doorspoelen tot vér erna zou de hele cyclus afwerken en eindigen bij "wachten op de volgende" —
// dan lijkt het alsof er niets gebeurd is.)
const KLOK = TUSSENTIJD_MS + 50

const vastToeval = () => vi.spyOn(Math, 'random').mockReturnValue(0.5)

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('reclame die het scherm overneemt', () => {
  it('toont niets zolang er geen reclame is', () => {
    const { container } = overlay(0)
    expect(container.querySelector('.ro')).toBeNull()
  })

  it('komt na ongeveer tien minuten in beeld en verdwijnt na vijftien seconden', () => {
    vastToeval()
    vi.useFakeTimers()
    const { container } = overlay(3)
    expect(container.querySelector('.ro')).toBeNull()

    act(() => {
      vi.advanceTimersByTime(KLOK)
    })
    expect(container.querySelector('.ro')).toBeTruthy()
    // De score erachter mag niet verdwijnen: er ligt een waas overheen, geen dekvlak.
    expect(container.querySelector('.ro-waas')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(OVERLAY_MS + 10)
    })
    // Eerst wegvagen…
    expect(container.querySelector('.ro.weg')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    // …en dan pas echt weg.
    expect(container.querySelector('.ro')).toBeNull()
  })

  it('blijft doorgaan: na de eerste komt er een volgende', () => {
    vastToeval()
    vi.useFakeTimers()
    const { container } = overlay(3)
    act(() => {
      vi.advanceTimersByTime(KLOK)
    })
    expect(container.querySelector('.ro')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(OVERLAY_MS + 1000)
    })
    expect(container.querySelector('.ro')).toBeNull()

    act(() => {
      vi.advanceTimersByTime(KLOK)
    })
    expect(container.querySelector('.ro')).toBeTruthy()
  })

  it('noemt de sponsor bij naam', () => {
    vastToeval()
    vi.useFakeTimers()
    const { container } = overlay(1)
    act(() => {
      vi.advanceTimersByTime(KLOK)
    })
    expect(container.querySelector('.ro-label')?.textContent).toContain('Sponsor 1')
  })
})
