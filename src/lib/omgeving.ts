// ── Live of federatie-testomgeving ───────────────────────────────────────────────────────────
// Het platform draait op twee plaatsen met dezelfde code:
//  • live: livescore.roodgries.be, met de aantekenmodus uit de settings (nu: supporters);
//  • federatie-test: een aparte Railway-omgeving met een EIGEN databank, waar het platform vast in
//    federatiemodus staat. Daar test en toon je de volledige federatieflow (opstelling,
//    scheidsrechtersakkoord, aftekenen, wedstrijdblad, vergoedingen) zonder ook maar iets aan de
//    live supportersmodus te raken. Zie docs/TESTOMGEVING.md.
//
// De omgeving komt uit één variabele per Railway-omgeving:
//   PLATFORM_OMGEVING=federatie-test   (server)
//   NEXT_PUBLIC_PLATFORM_OMGEVING=federatie-test   (zodat ook de browser het weet)
// En de links heen en terug, zodat de admin met één klik overstapt:
//   FEDERATIE_TEST_URL (op live) en LIVE_URL (op test).

export const TEST_OMGEVING = 'federatie-test'

/** Draait deze instantie als federatie-testomgeving? */
export function isTestOmgeving(): boolean {
  return (process.env.PLATFORM_OMGEVING ?? process.env.NEXT_PUBLIC_PLATFORM_OMGEVING) === TEST_OMGEVING
}

/** Een http(s)-adres uit een omgevingsvariabele, of null als het ontbreekt of ongeldig is. */
function adres(v: string | undefined): string | null {
  const s = (v ?? '').trim()
  if (!s) return null
  try {
    const u = new URL(s)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString().replace(/\/$/, '') : null
  } catch {
    return null
  }
}

/** Waar de admin naartoe overstapt: op live → de testomgeving, op test → live. */
export function andereOmgeving(): { label: string; url: string } | null {
  if (isTestOmgeving()) {
    const url = adres(process.env.LIVE_URL)
    return url ? { label: 'Terug naar live', url } : null
  }
  const url = adres(process.env.FEDERATIE_TEST_URL)
  return url ? { label: 'Naar federatie-testomgeving', url } : null
}
