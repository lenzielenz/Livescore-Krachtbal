// Een URL-pad terugbrengen tot de vorm waarin de router het uiteindelijk ziet.
//
// Dit bestaat omdat een vergelijking op de letterlijke `pathname` te omzeilen bleek. Next decodeert
// de padsegmenten pas bij het routeren, en Payload bouwt zijn endpoint daarna opnieuw op uit die
// gedecodeerde delen — dus `/api/users/forgot%2Dpassword` komt gewoon bij `/api/users/forgot-password`
// uit, terwijl `DICHT[pathname]` er niets in herkende. Wie een pad wil afsluiten, moet het eerst
// normaliseren.
//
// Puur en zonder next-afhankelijkheden, zodat het los te testen valt (de middleware zelf draait in
// de edge-runtime).

/** Hoe vaak we doorgaan met decoderen. `%252D` → `%2D` → `-`: twee rondes volstaan, drie is marge. */
const MAX_RONDES = 3

/**
 * Percent-decodeer (herhaald), maak alles kleine letters, trek dubbele schuine strepen samen en
 * laat een sluitende schuine streep weg.
 *
 * Zo vallen `/api/users/forgot%2Dpassword`, `/API/Users/Forgot-Password/` en
 * `//api/users/forgot-password` allemaal op dezelfde sleutel. Een kapotte codering laten we staan
 * zoals ze is — dat is toch geen pad dat ergens op uitkomt.
 */
export function normaliseerPad(pad: string): string {
  let uit = pad
  for (let i = 0; i < MAX_RONDES; i += 1) {
    let volgend: string
    try {
      volgend = decodeURIComponent(uit)
    } catch {
      break
    }
    if (volgend === uit) break
    uit = volgend
  }
  uit = uit.toLowerCase().replace(/\/+/g, '/')
  return uit.length > 1 && uit.endsWith('/') ? uit.slice(0, -1) : uit
}
