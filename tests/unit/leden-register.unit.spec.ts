import { describe, expect, it } from 'vitest'

import {
  filterNaarQuery,
  filterUitParams,
  geboortejarenVan,
  keuringDagen,
  keuringStand,
  legeTelling,
  tel,
  teDoen,
  toonVan,
} from '@/lib/leden-register'
import { playerSelectability } from '@/lib/lineup'

const NU = new Date('2026-11-12T10:00:00Z')
const dagenGeleden = (n: number) => new Date(NU.getTime() - n * 86_400_000).toISOString()
const ok = { vergunningsstatus: 'geldig', medischAttest: true }

describe('toestand van een lid', () => {
  it('volgt de registratie, met lid en inactief apart', () => {
    expect(toonVan({ soortLid: 'lid', ...ok })).toBe('lid')
    expect(toonVan({ actief: false, ...ok })).toBe('inactief')
    expect(toonVan({ ...ok })).toBe('ok') // lege soortLid = speler, leeg actief = actief
    expect(toonVan({ registratieStatus: 'ingediend', vergunningsstatus: 'aangevraagd' })).toBe('wacht')
    expect(toonVan({ registratieStatus: 'afgekeurd' })).toBe('fout')
    expect(toonVan({ registratieStatus: 'concept' })).toBe('todo')
    expect(toonVan({})).toBe('todo')
    // Goedgekeurd maar het attest is ingetrokken: niet meer "mag spelen".
    expect(toonVan({ registratieStatus: 'goedgekeurd', vergunningsstatus: 'geldig', medischAttest: false })).toBe('todo')
  })
})

describe('medische keuring (één competitieseizoen, tot 30 juni)', () => {
  it('geldig, verloopt binnen 30 dagen, verlopen, onbekend, niet nodig', () => {
    expect(keuringStand({ medischeKeuringOp: dagenGeleden(10) }, NU)).toBe('geldig')
    // Gekeurd op 1 juli 2026: het nieuwe seizoen, geldig. Op 30 juni 2026: vorig seizoen, verlopen.
    expect(keuringStand({ medischeKeuringOp: '2026-07-01' }, NU)).toBe('geldig')
    expect(keuringStand({ medischeKeuringOp: '2026-06-30' }, NU)).toBe('verlopen')
    expect(keuringStand({ medischeKeuringOp: '2026-01-10' }, new Date('2026-06-12T10:00:00Z'))).toBe('verloopt')
    expect(keuringStand({ medischeKeuringOp: '2026-01-10' }, new Date('2026-05-12T10:00:00Z'))).toBe('geldig')
    expect(keuringStand({}, NU)).toBe('onbekend')
    expect(keuringStand({ soortLid: 'lid', medischeKeuringOp: dagenGeleden(800) }, NU)).toBe('nvt')
    expect(keuringStand({ actief: false, medischeKeuringOp: dagenGeleden(800) }, NU)).toBe('nvt')
  })
  it('telt de dagen tot het einde', () => {
    // NU = 12 november 2026: tot 1 juli 2027 (00:00 Belgische tijd) zijn het nog 230 volle dagen.
    expect(keuringDagen({ medischeKeuringOp: '2026-09-01' }, NU)).toBe(230)
    // Seizoen 2025-2026 verliep op 1 juli 2026: ruim 134 dagen geleden (naar beneden afgerond: -135).
    expect(keuringDagen({ medischeKeuringOp: '2026-03-01' }, NU)).toBe(-135)
    expect(keuringDagen({}, NU)).toBeNull()
  })
})

describe('categorie als geboortejaren', () => {
  it('seizoen 2026–2027 (peiljaar 2027)', () => {
    expect(geboortejarenVan('U14', 2026)).toEqual([2014, 2015])
    expect(geboortejarenVan('U20', 2026)).toEqual([2008, 2009])
    expect(geboortejarenVan('U6', 2026)?.[1]).toBe(2027)
  })
})

describe('filter in de URL', () => {
  it('neemt enkel geldige waarden over', () => {
    expect(filterUitParams({ toon: 'ok', keuring: 'verlopen', club: '12', categorie: 'U14', geslacht: 'v', zoek: ' an ' })).toEqual({
      zoek: ' an ',
      club: 12,
      ploeg: null,
      toon: 'ok',
      keuring: 'verlopen',
      categorie: 'U14',
      geslacht: 'v',
    })
    const slecht = filterUitParams({ toon: 'drop table', keuring: 'nvt', club: '-3', categorie: 'U99', geslacht: 'x' })
    expect([slecht.toon, slecht.keuring, slecht.club, slecht.categorie, slecht.geslacht]).toEqual([null, null, null, null, null])
  })
  it('zet het filter terug in een querystring zonder lege waarden', () => {
    expect(filterNaarQuery({ toon: 'ok', club: null, zoek: '', pagina: 2 })).toBe('toon=ok&pagina=2')
  })
})

describe('tellingen', () => {
  it('telt toestand en keuring, en wat te doen is', () => {
    const t = legeTelling()
    tel(t, { ...ok, medischeKeuringOp: dagenGeleden(10) }, NU)
    tel(t, { ...ok, medischeKeuringOp: dagenGeleden(370) }, NU)
    tel(t, { ...ok }, NU)
    tel(t, { registratieStatus: 'afgekeurd' }, NU)
    tel(t, { soortLid: 'lid' }, NU)
    expect([t.totaal, t.ok, t.fout, t.lid, t.verlopen, t.onbekend]).toEqual([5, 3, 1, 1, 1, 2])
    expect(teDoen(t)).toBe(1 + 1 + 2) // afgekeurd + verlopen + 2 zonder datum
  })
})

describe('opstelling: verlopen keuring volgens het beleid', () => {
  const speler = { vergunningsstatus: 'geldig', medischAttest: true, actief: true, birthDate: '1995-01-01' }
  it('waarschuwt standaard, blokkeert als de federatie dat kiest, en zegt niets zonder datum', () => {
    const verlopen = { ...speler, medischeKeuringOp: dagenGeleden(400) }
    expect(playerSelectability(verlopen, 'senioren', 2026, NU).level).toBe('warn')
    expect(playerSelectability({ ...verlopen, keuringBeleid: 'blokkeren' }, 'senioren', 2026, NU).level).toBe('block')
    expect(playerSelectability({ ...speler, keuringBeleid: 'blokkeren' }, 'senioren', 2026, NU).level).toBe('ok')
    expect(playerSelectability({ ...speler, medischeKeuringOp: dagenGeleden(30), keuringBeleid: 'blokkeren' }, 'senioren', 2026, NU).level).toBe('ok')
  })
})
