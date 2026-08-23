// Digital Asset Links — de koppeling tussen de Android-app (Play Store) en dit domein.
//
// Een TWA (Trusted Web Activity, de app-schil rond deze webapp) toont enkel géén browserbalk
// wanneer Chrome kan bewijzen dat de app en de site bij elkaar horen. Dat bewijs staat in
// /.well-known/assetlinks.json: de package-naam plus de SHA-256-vingerafdruk van de sleutel
// waarmee Google Play de app ondertekent.
//
// De vingerafdruk is publieke informatie (ze hoort net wél gepubliceerd te worden), maar ze is pas
// bekend nadat de app in de Play Console staat. Daarom komt ze uit de omgeving i.p.v. uit de code:
// ANDROID_PACKAGE_NAME + ANDROID_CERT_FINGERPRINTS. Zie docs/ANDROID-PLAYSTORE.md.

export interface AssetLinkStatement {
  relation: string[]
  target: {
    namespace: 'android_app'
    package_name: string
    sha256_cert_fingerprints: string[]
  }
}

/** Een geldige SHA-256-vingerafdruk: 32 hex-paren, gescheiden door dubbele punten. */
const FINGERPRINT = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/

/** Een package-naam: minstens twee segmenten, elk beginnend met een letter (com.club.app). */
const PACKAGE = /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+$/

/**
 * Normaliseer één vingerafdruk. Play Console toont ze met dubbele punten in hoofdletters, maar
 * kopieerwerk levert vaak kleine letters of spaties op — dat mag de verificatie niet breken.
 * Geeft null terug als het geen bruikbare vingerafdruk is (dan laten we ze liever weg dan een
 * ongeldig bestand te publiceren, want daar faalt de hele verificatie op).
 */
export function normalizeFingerprint(raw: string): string | null {
  const cleaned = raw.trim().replace(/\s+/g, '').toUpperCase()
  if (!cleaned) return null
  // Zonder dubbele punten (64 hex-tekens) mag ook: zelf opsplitsen.
  const withColons = /^[0-9A-F]{64}$/.test(cleaned)
    ? (cleaned.match(/.{2}/g) as string[]).join(':')
    : cleaned
  return FINGERPRINT.test(withColons) ? withColons : null
}

/**
 * Bouwt de inhoud van assetlinks.json. Zonder (geldige) configuratie geven we bewust een lege
 * lijst terug: dat is een geldig bestand dat simpelweg niets verklaart. Een 404 of kapotte JSON
 * zou de verificatie met een onduidelijke fout laten mislukken.
 */
export function buildAssetLinks(input: {
  packageName?: string | null
  fingerprints?: string | string[] | null
}): AssetLinkStatement[] {
  const pkg = (input.packageName ?? '').trim()
  if (!PACKAGE.test(pkg)) return []

  const raw = Array.isArray(input.fingerprints)
    ? input.fingerprints
    : String(input.fingerprints ?? '').split(/[,\n;]/)
  const prints = [...new Set(raw.map(normalizeFingerprint).filter((f): f is string => f !== null))]
  if (prints.length === 0) return []

  return [
    {
      // handle_all_urls: de app mag alle links binnen dit domein openen (deep links).
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: prints },
    },
  ]
}

/** Leest de configuratie uit de omgeving. */
export function assetLinksFromEnv(env: NodeJS.ProcessEnv = process.env): AssetLinkStatement[] {
  return buildAssetLinks({
    packageName: env.ANDROID_PACKAGE_NAME,
    fingerprints: env.ANDROID_CERT_FINGERPRINTS,
  })
}
