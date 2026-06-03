import { headers } from 'next/headers'

import { getPayloadClient } from './payload-client'

// Haalt de ingelogde gebruiker op in een server-context (layout/page/route).
// Valt stil terug op null als er geen geldige sessie is.
export async function getAuthUser() {
  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: await headers() }).catch(() => ({ user: null }))
  return user
}
