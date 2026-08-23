import { describe, it, expect } from 'vitest'

import { assetLinksFromEnv, buildAssetLinks, normalizeFingerprint } from '@/lib/assetlinks'

const FP = 'A1:B2:C3:D4:E5:F6:07:18:29:3A:4B:5C:6D:7E:8F:90:A1:B2:C3:D4:E5:F6:07:18:29:3A:4B:5C:6D:7E:8F:90'

describe('normalizeFingerprint', () => {
  it('aanvaardt de vorm die de Play Console toont', () => {
    expect(normalizeFingerprint(FP)).toBe(FP)
  })

  it('herstelt kleine letters en spaties uit kopieerwerk', () => {
    expect(normalizeFingerprint(`  ${FP.toLowerCase()} `)).toBe(FP)
    expect(normalizeFingerprint(FP.replace(/:/g, ': '))).toBe(FP)
  })

  it('aanvaardt ook de vorm zonder dubbele punten', () => {
    expect(normalizeFingerprint(FP.replace(/:/g, ''))).toBe(FP)
  })

  it('weigert wat geen vingerafdruk is', () => {
    expect(normalizeFingerprint('')).toBeNull()
    expect(normalizeFingerprint('geen-vingerafdruk')).toBeNull()
    expect(normalizeFingerprint(FP.slice(0, -3))).toBeNull() // te kort
    expect(normalizeFingerprint(`${FP}:AB`)).toBeNull() // te lang
    expect(normalizeFingerprint(FP.replace('A1', 'ZZ'))).toBeNull() // geen hex
  })
})

describe('buildAssetLinks', () => {
  it('bouwt één verklaring met de app en haar vingerafdruk', () => {
    expect(buildAssetLinks({ packageName: 'be.krachtbal.live', fingerprints: FP })).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'be.krachtbal.live',
          sha256_cert_fingerprints: [FP],
        },
      },
    ])
  })

  it('neemt meerdere vingerafdrukken mee (upload- én Play-sleutel)', () => {
    const tweede = FP.replace(/^A1/, 'B2')
    const out = buildAssetLinks({ packageName: 'be.krachtbal.live', fingerprints: `${FP}, ${tweede}` })
    expect(out[0].target.sha256_cert_fingerprints).toEqual([FP, tweede])
  })

  it('ontdubbelt en negeert onbruikbare regels i.p.v. een kapot bestand te maken', () => {
    const out = buildAssetLinks({
      packageName: 'be.krachtbal.live',
      fingerprints: [FP, FP.toLowerCase(), 'nonsens', ''],
    })
    expect(out[0].target.sha256_cert_fingerprints).toEqual([FP])
  })

  it('geeft een lege lijst zonder configuratie — geldig JSON, geen verklaring', () => {
    expect(buildAssetLinks({ packageName: '', fingerprints: FP })).toEqual([])
    expect(buildAssetLinks({ packageName: 'be.krachtbal.live', fingerprints: '' })).toEqual([])
    expect(buildAssetLinks({ packageName: 'be.krachtbal.live', fingerprints: 'onzin' })).toEqual([])
  })

  it('weigert een package-naam die er geen is', () => {
    expect(buildAssetLinks({ packageName: 'krachtbal', fingerprints: FP })).toEqual([]) // geen punt
    expect(buildAssetLinks({ packageName: '1be.krachtbal', fingerprints: FP })).toEqual([]) // cijfer vooraan
    expect(buildAssetLinks({ packageName: 'be..krachtbal', fingerprints: FP })).toEqual([])
  })
})

describe('assetLinksFromEnv', () => {
  it('leest package en vingerafdrukken uit de omgeving', () => {
    const out = assetLinksFromEnv({ NODE_ENV: 'test', ANDROID_PACKAGE_NAME: 'be.krachtbal.live', ANDROID_CERT_FINGERPRINTS: FP })
    expect(out).toHaveLength(1)
    expect(out[0].target.package_name).toBe('be.krachtbal.live')
  })

  it('geeft een lege lijst wanneer er niets ingesteld is', () => {
    expect(assetLinksFromEnv({ NODE_ENV: 'test' })).toEqual([])
  })
})
