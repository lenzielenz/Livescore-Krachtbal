import { cookies, headers } from 'next/headers'

import { alsVersLid, KIJKMODUS_COOKIE, kijkmodusAan } from './kijkmodus'
import { getPayloadClient } from './payload-client'

// Haalt de ingelogde gebruiker op in een server-context (layout/page/route).
// Volledig defensief: een ontbrekende sessie, een niet-geïnitialiseerde Payload
// (bv. tijdens de build zonder secret) of een DB-storing mag NOOIT de
// paginarender breken — in al die gevallen geldt simpelweg "geen gebruiker".
//
// Kijkmodus: met de kijkmodus-cookie ziet elke pagina dit account als een vers geregistreerd
// lid (rollen/club/analyse gestript). Puur visueel en enkel afwaarderend — de API-permissies
// gebruiken hun eigen auth en blijven onaangeroerd.
export async function getAuthUser() {
  try {
    const payload = await getPayloadClient()
    const { user } = await payload.auth({ headers: await headers() })
    if (user && kijkmodusAan((await cookies()).get(KIJKMODUS_COOKIE)?.value)) {
      return alsVersLid(user)
    }
    return user
  } catch {
    return null
  }
}
