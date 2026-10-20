// ── Live, federatie-testomgeving of demoruimte ───────────────────────────────────────────────
// Het platform draait op meerdere plaatsen met dezelfde code:
//  • live: livescore.roodgries.be, met de aantekenmodus uit de settings (nu: supporters);
//  • federatie-test: een aparte Railway-omgeving met een EIGEN databank, waar het platform vast in
//    federatiemodus staat. Daar test en toon je de volledige federatieflow (opstelling,
//    scheidsrechtersakkoord, aftekenen, wedstrijdblad, vergoedingen) zonder ook maar iets aan de
//    live supportersmodus te raken. Zie docs/TESTOMGEVING.md.
//  • demo: nog een aparte omgeving met een EIGEN databank, enkel om voor te stellen. Ook vast in
//    federatiemodus, met de demoruimte (/demoruimte): een draaiboek, rol wisselen met één tik en
//    een knop die een volledige demowereld klaarzet. Zie docs/DEMORUIMTE.md. Rol wisselen zonder
//    wachtwoord en alles wissen kan ENKEL hier — nooit op live of de testomgeving.
//
// De omgeving komt uit één variabele per Railway-omgeving:
//   PLATFORM_OMGEVING=federatie-test   (server)
//   NEXT_PUBLIC_PLATFORM_OMGEVING=federatie-test   (zodat ook de browser het weet)
// En de links heen en terug, zodat de admin met één klik overstapt:
//   FEDERATIE_TEST_URL (op live) en LIVE_URL (op test).

export const TEST_OMGEVING = 'federatie-test'
export const DEMO_OMGEVING = 'demo'

const omgeving = () => process.env.PLATFORM_OMGEVING ?? process.env.NEXT_PUBLIC_PLATFORM_OMGEVING

/** Draait deze instantie als federatie-testomgeving? */
export function isTestOmgeving(): boolean {
  return omgeving() === TEST_OMGEVING
}

/** Draait deze instantie als demoruimte (aparte databank, enkel om voor te stellen)? */
export function isDemoOmgeving(): boolean {
  return omgeving() === DEMO_OMGEVING
}

/** Staat deze instantie vast in federatiemodus (testomgeving of demoruimte)? */
export function isFederatieOmgeving(): boolean {
  return isTestOmgeving() || isDemoOmgeving()
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

/** Waar de admin naartoe overstapt: op live → de testomgeving, op test (of demo) → live. */
export function andereOmgeving(): { label: string; url: string } | null {
  if (isFederatieOmgeving()) {
    const url = adres(process.env.LIVE_URL)
    return url ? { label: 'Terug naar live', url } : null
  }
  const url = adres(process.env.FEDERATIE_TEST_URL)
  return url ? { label: 'Naar federatie-testomgeving', url } : null
}
