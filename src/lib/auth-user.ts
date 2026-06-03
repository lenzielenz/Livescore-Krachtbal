import { headers } from 'next/headers'

import { getPayloadClient } from './payload-client'

// Haalt de ingelogde gebruiker op in een server-context (layout/page/route).
// Volledig defensief: een ontbrekende sessie, een niet-geïnitialiseerde Payload
// (bv. tijdens de build zonder secret) of een DB-storing mag NOOIT de
// paginarender breken — in al die gevallen geldt simpelweg "geen gebruiker".
export async function getAuthUser() {
  try {
    const payload = await getPayloadClient()
    const { user } = await payload.auth({ headers: await headers() })
    return user
  } catch {
    return null
  }
}
