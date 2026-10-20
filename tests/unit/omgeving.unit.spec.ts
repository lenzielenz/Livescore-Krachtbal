import { afterEach, describe, expect, it } from 'vitest'

import { andereOmgeving, isTestOmgeving } from '@/lib/omgeving'
import { getScoreMode } from '@/lib/score-mode'

const BEWAARD = { ...process.env }
afterEach(() => {
  for (const k of ['PLATFORM_OMGEVING', 'NEXT_PUBLIC_PLATFORM_OMGEVING', 'FEDERATIE_TEST_URL', 'LIVE_URL']) {
    if (BEWAARD[k] === undefined) delete process.env[k]
    else process.env[k] = BEWAARD[k]
  }
})

// Een nep-payload die de settings-global teruggeeft met supporters-modus aan.
const payloadMetSupporters = { findGlobal: async () => ({ scoreMode: 'supporters' }) } as unknown as Parameters<typeof getScoreMode>[0]

describe('federatie-testomgeving', () => {
  it('live: de modus komt uit de settings', async () => {
    delete process.env.PLATFORM_OMGEVING
    expect(isTestOmgeving()).toBe(false)
    expect(await getScoreMode(payloadMetSupporters)).toBe('supporters')
  })
  it('test: altijd federatiemodus, wat de settings ook zeggen', async () => {
    process.env.PLATFORM_OMGEVING = 'federatie-test'
    expect(isTestOmgeving()).toBe(true)
    expect(await getScoreMode(payloadMetSupporters)).toBe('federatie')
  })
  it('de overstapknop wijst naar de andere omgeving, en ontbreekt zonder geldig adres', () => {
    delete process.env.PLATFORM_OMGEVING
    process.env.FEDERATIE_TEST_URL = 'https://test.livescore.roodgries.be/'
    expect(andereOmgeving()).toEqual({ label: 'Naar federatie-testomgeving', url: 'https://test.livescore.roodgries.be' })
    process.env.FEDERATIE_TEST_URL = 'javascript:alert(1)'
    expect(andereOmgeving()).toBeNull()
    process.env.PLATFORM_OMGEVING = 'federatie-test'
    process.env.LIVE_URL = 'https://livescore.roodgries.be'
    expect(andereOmgeving()).toEqual({ label: 'Terug naar live', url: 'https://livescore.roodgries.be' })
  })
})

describe('demoruimte', () => {
  it('demo: altijd federatiemodus, en enkel daar de demoruimte', async () => {
    const { isDemoOmgeving, isFederatieOmgeving } = await import('@/lib/omgeving')
    const { demoToegang } = await import('@/lib/demoruimte/toegang')
    process.env.PLATFORM_OMGEVING = 'demo'
    expect(isDemoOmgeving()).toBe(true)
    expect(isTestOmgeving()).toBe(false)
    expect(isFederatieOmgeving()).toBe(true)
    expect(await getScoreMode(payloadMetSupporters)).toBe('federatie')
    expect(demoToegang(null)).toBe(true)
    process.env.PLATFORM_OMGEVING = 'federatie-test'
    expect(demoToegang(null)).toBe(false)
    delete process.env.PLATFORM_OMGEVING
    expect(demoToegang(null)).toBe(false)
  })
  it('met een toegangscode: enkel met de juiste cookie', async () => {
    const { codeHash, demoToegang } = await import('@/lib/demoruimte/toegang')
    process.env.PLATFORM_OMGEVING = 'demo'
    process.env.DEMO_TOEGANGSCODE = 'krachtbal'
    expect(demoToegang(null)).toBe(false)
    expect(demoToegang(codeHash('fout'))).toBe(false)
    expect(demoToegang(codeHash('krachtbal'))).toBe(true)
    delete process.env.DEMO_TOEGANGSCODE
  })
  it('verbergt virtueel krachtbal en training enkel in de demo', async () => {
    const { verborgenInDemo } = await import('@/lib/omgeving')
    process.env.PLATFORM_OMGEVING = 'demo'
    expect(verborgenInDemo('/virtueel')).toBe(true)
    expect(verborgenInDemo('/virtueel/stadion?x=1')).toBe(true)
    expect(verborgenInDemo('/beheer/training/progressie')).toBe(true)
    expect(verborgenInDemo('/beheer/trainingen')).toBe(false)
    expect(verborgenInDemo('/club')).toBe(false)
    process.env.PLATFORM_OMGEVING = 'federatie-test'
    expect(verborgenInDemo('/virtueel')).toBe(false)
    delete process.env.PLATFORM_OMGEVING
    expect(verborgenInDemo('/beheer/training')).toBe(false)
  })
})
