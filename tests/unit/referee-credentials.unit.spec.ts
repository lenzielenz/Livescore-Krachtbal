import { describe, expect, it } from 'vitest'

import {
  delegationQrValue,
  matchPersonalCode,
  personalCode,
  personalQrValue,
  verifyCredential,
} from '@/lib/referee-credentials'

const SECRET = 'test-secret-test-secret-test-secret-1234'

describe('referee-credentials', () => {
  it('verifieert een geldige persoonlijke QR en koppelt het juiste official-id', () => {
    const qr = personalQrValue(SECRET, 42)
    const cred = verifyCredential(SECRET, qr)
    expect(cred).toEqual({ kind: 'personal', officialId: '42' })
  })

  it('weigert een geknoeide of vreemd-getekende QR', () => {
    const qr = personalQrValue(SECRET, 42)
    expect(verifyCredential(SECRET, qr.replace(/.$/, '0') === qr ? qr + '0' : qr.replace(/.$/, '0'))).toBeNull()
    expect(verifyCredential('ander-geheim-ander-geheim-ander-1234', qr)).toBeNull()
    expect(verifyCredential(SECRET, 'rommel')).toBeNull()
  })

  it('markeert een vervallen delegatie als expired maar houdt de handtekening geldig', () => {
    const verleden = Date.now() - 60_000
    const toekomst = Date.now() + 60 * 60_000
    const verlopen = delegationQrValue(SECRET, 7, verleden)
    const geldig = delegationQrValue(SECRET, 7, toekomst)
    expect(verifyCredential(SECRET, verlopen)).toMatchObject({ kind: 'delegation', officialId: '7', expired: true })
    expect(verifyCredential(SECRET, geldig)).toMatchObject({ kind: 'delegation', officialId: '7', expired: false })
  })

  it('matcht een ingetikte persoonlijke code enkel tegen de juiste kandidaat', () => {
    const code = personalCode(SECRET, 13)
    expect(matchPersonalCode(SECRET, code.toLowerCase(), [5, 13, 99])).toBe('13')
    expect(matchPersonalCode(SECRET, code, [5, 99])).toBeNull()
    expect(matchPersonalCode(SECRET, 'XXXXXXXX', [13])).toBeNull()
  })
})
