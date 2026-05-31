import { getPayload } from 'payload'

import config from '@/payload.config'

/** Gedeelde Payload-instantie voor server-routes en server components. */
export async function getPayloadClient() {
  return getPayload({ config: await config })
}
