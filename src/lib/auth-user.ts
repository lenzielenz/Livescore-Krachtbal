import { cookies, headers } from 'next/headers'

import { alsVersLid, KIJKMODUS_COOKIE, kijkmodusAan } from './kijkmodus'
import { getPayloadClient } from './payload-client'
import { heeftSessie } from './prive-pagina'

// Haalt de ingelogde gebruiker op in een server-context (layout/page/route).
// Volledig defensief: een ontbrekende sessie, een niet-geïnitialiseerde Payload
// (bv. tijdens de build zonder secret) of een DB-storing mag NOOIT de
// paginarender breken — in al die gevallen geldt simpelweg "geen gebruiker".
//
// Kijkmodus: met de kijkmodus-cookie ziet elke pagina dit account als een vers geregistreerd
// lid (rollen/club/analyse gestript). Puur visueel en enkel afwaarderend — de API-permissies
// gebruiken hun eigen auth en blijven onaangeroerd.

/** Hoelang wachten voor de tweede poging. Kort: dit houdt een paginalading op. */
const HERKANS_MS = 250

export async function getAuthUser() {
  const kop = await headers()
  // Draagt de bezoeker een sessiecookie, dan is "geen gebruiker" een verrassend antwoord en
  // krijgt de controle één herkansing. Dat is geen luxe: bij een uitrol draait er eerst
  // `payload migrate`, en een verificatie die net dán op een tabelslot botst faalt binnen de
  // seconde. Zonder herkansing rendert de pagina die bezoeker als een vreemde — inclusief een
  // "Inloggen"-knop — terwijl zijn sessie kerngezond is. Dát is wat "een update logt me af"
  // bleek te zijn.
  const pogingen = heeftSessie(kop.get('cookie')) ? 2 : 1

  for (let poging = 0; poging < pogingen; poging += 1) {
    try {
      const payload = await getPayloadClient()
      const { user } = await payload.auth({ headers: kop })
      if (user && kijkmodusAan((await cookies()).get(KIJKMODUS_COOKIE)?.value)) {
        return alsVersLid(user)
      }
      // Een ongeldige of verlopen cookie geeft gewoon `null` terug (geen fout): dan is de
      // bezoeker écht uitgelogd en heeft opnieuw proberen geen zin.
      return user
    } catch {
      if (poging + 1 < pogingen) await new Promise((r) => setTimeout(r, HERKANS_MS))
    }
  }
  return null
}
