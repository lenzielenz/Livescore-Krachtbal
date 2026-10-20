import { describe, expect, it } from 'vitest'

import { playerSelectability } from '@/lib/lineup'
import {
  clubMagBewerken,
  isSpeelgerechtigd,
  keuringGeldig,
  ontbreektVoorIndienen,
  registratieIcoon,
  volledigeNaam,
} from '@/lib/registratie'

const nu = new Date('2026-10-20T12:00:00Z')
const volledig = {
  voornaam: 'Jan',
  achternaam: 'Peeters',
  birthDate: '2001-03-04',
  geslacht: 'm',
  soortLid: 'speler',
  medischeKeuringOp: '2026-09-01',
  heeftAttest: true,
}

describe('spelersregistratie', () => {
  it('een volledige speler kan ingediend worden', () => {
    expect(ontbreektVoorIndienen(volledig, nu)).toEqual([])
    expect(registratieIcoon(volledig, nu)).toMatchObject({ icoon: '📤', toon: 'todo' })
  })

  it('zegt wat er ontbreekt', () => {
    expect(ontbreektVoorIndienen({ soortLid: 'speler' }, nu)).toEqual([
      'voornaam',
      'naam',
      'geboortedatum',
      'geslacht',
      'keuringsdatum',
      'doktersattest',
    ])
  })

  it('een keuring ouder dan een jaar is verlopen', () => {
    expect(keuringGeldig('2025-10-01', nu)).toBe(false)
    expect(keuringGeldig('2025-11-01', nu)).toBe(true)
    expect(ontbreektVoorIndienen({ ...volledig, medischeKeuringOp: '2025-01-01' }, nu)).toEqual(['geldige keuringsdatum'])
  })

  it('een gewoon lid heeft geen keuring of attest nodig en speelt nooit', () => {
    const lid = { ...volledig, soortLid: 'lid', medischeKeuringOp: null, heeftAttest: false }
    expect(ontbreektVoorIndienen(lid, nu)).toEqual([])
    expect(isSpeelgerechtigd({ ...lid, vergunningsstatus: 'geldig', medischAttest: true })).toBe(false)
    expect(registratieIcoon(lid, nu).icoon).toBe('👤')
  })

  it('icoon volgt de status', () => {
    expect(registratieIcoon({ ...volledig, registratieStatus: 'ingediend' }, nu).icoon).toBe('⏳')
    expect(registratieIcoon({ ...volledig, registratieStatus: 'afgekeurd' }, nu).icoon).toBe('✗')
    expect(registratieIcoon({ ...volledig, vergunningsstatus: 'geldig', medischAttest: true }, nu).icoon).toBe('✅')
  })

  it('speelgerechtigd los van het doktersverbod om hoger te spelen', () => {
    expect(isSpeelgerechtigd({ vergunningsstatus: 'geldig', medischAttest: true })).toBe(true)
    expect(isSpeelgerechtigd({ vergunningsstatus: 'geldig', medischAttest: true, actief: false })).toBe(false)
    expect(isSpeelgerechtigd({ vergunningsstatus: 'aangevraagd', medischAttest: true })).toBe(false)
  })

  it('de club bewerkt niet terwijl de federatie beslist', () => {
    expect(clubMagBewerken('ingediend')).toBe(false)
    expect(clubMagBewerken('afgekeurd')).toBe(true)
    expect(clubMagBewerken(null)).toBe(true)
  })

  it('volledige naam zonder dubbele spaties', () => {
    expect(volledigeNaam('  An ', ' De  Smet ')).toBe('An De Smet')
  })

  it('een gewoon lid kan niet opgesteld worden', () => {
    const s = playerSelectability(
      { vergunningsstatus: 'geldig', medischAttest: true, birthDate: '2000-01-01', soortLid: 'lid' },
      'senioren',
      2026,
    )
    expect(s.level).toBe('block')
    expect(s.reasons).toContain('Gewoon lid — geen speler.')
  })
})
