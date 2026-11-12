import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { actieveDiensten, identiteitUit, startPoging, veiligPad } from '@/lib/oauth'

// Inloggen met Google, Microsoft en Apple: de pure kant.

describe('welk e-mailadres telt als bevestigd', () => {
  it('Google en Apple: enkel met email_verified', () => {
    expect(identiteitUit('google', { sub: '1', email: 'An@Voorbeeld.be', email_verified: true })).toMatchObject({ email: 'an@voorbeeld.be', emailGeverifieerd: true })
    expect(identiteitUit('google', { sub: '1', email: 'an@voorbeeld.be', email_verified: false }).emailGeverifieerd).toBe(false)
    expect(identiteitUit('apple', { sub: '1', email: 'an@privaterelay.appleid.com', email_verified: 'true' }).emailGeverifieerd).toBe(true)
    expect(identiteitUit('apple', { sub: '1' }).emailGeverifieerd).toBe(false)
  })
  it('Microsoft: persoonlijk account of een tenant die het domein bezit — anders niet (nOAuth)', () => {
    expect(identiteitUit('microsoft', { sub: '1', email: 'a@hotmail.com', tid: '9188040d-6c67-4c5b-b112-36a304b66dad' }).emailGeverifieerd).toBe(true)
    expect(identiteitUit('microsoft', { sub: '1', email: 'a@club.be', tid: 'abc', xms_edov: true }).emailGeverifieerd).toBe(true)
    // Een werk-tenant kan een willekeurig adres in "email" zetten: dat is geen bewijs.
    expect(identiteitUit('microsoft', { sub: '1', email: 'voorzitter@federatie.be', tid: 'kwaadwillig' }).emailGeverifieerd).toBe(false)
  })
})

describe('terugkeren enkel binnen de site', () => {
  it('weigert externe en protocol-relatieve adressen', () => {
    expect(veiligPad('/club/leden?x=1')).toBe('/club/leden?x=1')
    expect(veiligPad('//kwaad.be')).toBe('/')
    expect(veiligPad('/\\kwaad.be')).toBe('/')
    expect(veiligPad('https://kwaad.be')).toBe('/')
    expect(veiligPad(undefined)).toBe('/')
  })
})

describe('de aanmeld-URL', () => {
  const oud = { ...process.env }
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'g-id'
    process.env.GOOGLE_CLIENT_SECRET = 'g-geheim'
    process.env.PUBLIC_SERVER_URL = 'https://livescore.voorbeeld.be/'
    delete process.env.MICROSOFT_CLIENT_ID
    delete process.env.APPLE_CLIENT_ID
  })
  afterEach(() => {
    process.env = { ...oud }
  })
  it('enkel ingestelde diensten staan aan', () => {
    expect(actieveDiensten()).toEqual(['google'])
  })
  it('met state, nonce, PKCE en de juiste terugkeer-URL', async () => {
    const { url, poging } = await startPoging(new Request('http://intern:3000/x'), 'google', '/club')
    const u = new URL(url)
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(u.searchParams.get('redirect_uri')).toBe('https://livescore.voorbeeld.be/api/auth/oauth/google/callback')
    expect([u.searchParams.get('state'), u.searchParams.get('nonce')]).toEqual([poging.state, poging.nonce])
    expect(u.searchParams.get('code_challenge_method')).toBe('S256')
    expect(u.searchParams.get('code_challenge')).not.toBe(poging.verifier)
    expect(poging.state.length).toBeGreaterThan(30)
    expect(poging.next).toBe('/club')
  })
})
