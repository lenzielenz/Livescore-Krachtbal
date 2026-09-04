import { describe, it, expect } from 'vitest'

import {
  HERSTEL_GELDIG_MS,
  MIN_WACHTWOORD,
  geldigeToken,
  herstelLink,
  vervalTekst,
  vervaltOp,
  wachtwoordFout,
} from '@/lib/wachtwoord-reset'

// De regels rond de herstellink. Er gaat geen mail de deur uit: een beheerder maakt de link en
// geeft ze door. Dat maakt deze regels — hoe lang ze geldig is, hoe ze eruitziet, wat een
// geldig wachtwoord is — de enige bescherming die er tussen zit.

describe('geldigeToken', () => {
  it('aanvaardt de hex-token die Payload maakt', () => {
    // crypto.randomBytes(20).toString('hex') = 40 hex-tekens.
    const echt = 'a'.repeat(40)
    expect(geldigeToken(echt)).toBe(echt)
    expect(geldigeToken(`  ${echt}  `)).toBe(echt)
    expect(geldigeToken('AbCdEf0123456789abcdef0123456789abcdef01')).toBeTruthy()
  })

  it('weigert alles wat geen token kan zijn', () => {
    // Streng zijn scheelt een databasevraag per geknutselde link, en houdt rommel uit de logs.
    expect(geldigeToken('')).toBeNull()
    expect(geldigeToken(null)).toBeNull()
    expect(geldigeToken(42)).toBeNull()
    expect(geldigeToken('kort')).toBeNull()
    expect(geldigeToken('z'.repeat(40))).toBeNull() // geen hex
    expect(geldigeToken('a'.repeat(200))).toBeNull() // absurd lang
    expect(geldigeToken("' OR 1=1 --")).toBeNull()
  })
})

describe('wachtwoordFout', () => {
  it('eist dezelfde minimumlengte als registreren en wachtwoord wijzigen', () => {
    expect(wachtwoordFout('a'.repeat(MIN_WACHTWOORD))).toBeNull()
    expect(wachtwoordFout('a'.repeat(MIN_WACHTWOORD - 1))).toContain(`${MIN_WACHTWOORD} tekens`)
    // Payload zelf zou drie tekens aanvaarden — deze grens is dus niet decoratief.
    expect(wachtwoordFout('abc')).not.toBeNull()
  })

  it('weigert niet-tekst en absurde lengtes', () => {
    expect(wachtwoordFout(null)).not.toBeNull()
    expect(wachtwoordFout(12345678)).not.toBeNull()
    expect(wachtwoordFout('a'.repeat(201))).toContain('te lang')
  })
})

describe('herstelLink', () => {
  it('bouwt een volledige link met de publieke basis-URL', () => {
    expect(herstelLink('abc123', 'https://krachtbal.live')).toBe(
      'https://krachtbal.live/wachtwoord-herstellen?token=abc123',
    )
  })

  it('laat een dubbele schuine streep niet ontstaan', () => {
    expect(herstelLink('abc123', 'https://krachtbal.live/')).toBe(
      'https://krachtbal.live/wachtwoord-herstellen?token=abc123',
    )
  })

  it('geeft een pad terug zonder basis, in plaats van een halve URL', () => {
    // Zonder PUBLIC_SERVER_URL zou 'undefined/wachtwoord-herstellen…' een onbruikbare link
    // opleveren die de beheerder tóch doorstuurt.
    expect(herstelLink('abc123')).toBe('/wachtwoord-herstellen?token=abc123')
    expect(herstelLink('abc123', '   ')).toBe('/wachtwoord-herstellen?token=abc123')
  })

  it('codeert de token in de URL', () => {
    expect(herstelLink('a b&c', 'https://x.be')).toBe('https://x.be/wachtwoord-herstellen?token=a%20b%26c')
  })
})

describe('vervaltOp', () => {
  it('rekent één dag vooruit vanaf het gegeven moment', () => {
    const nu = Date.UTC(2026, 8, 4, 12, 0, 0)
    expect(vervaltOp(nu).getTime()).toBe(nu + HERSTEL_GELDIG_MS)
    expect(HERSTEL_GELDIG_MS).toBe(24 * 60 * 60 * 1000)
  })

  it('laat een andere geldigheidsduur toe', () => {
    const nu = Date.UTC(2026, 8, 4, 12, 0, 0)
    expect(vervaltOp(nu, 60_000).getTime()).toBe(nu + 60_000)
  })
})

describe('vervalTekst', () => {
  it('schrijft de vervaldatum uit voor het beheerscherm', () => {
    const tekst = vervalTekst(new Date(Date.UTC(2026, 8, 5, 10, 30)))
    // Belgische notatie, met de dag erbij — het is een geheugensteun voor wie de link doorgeeft.
    expect(tekst).toMatch(/september/i)
    expect(tekst).toMatch(/5/)
  })
})
