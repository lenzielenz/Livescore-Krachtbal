import { redirect } from 'next/navigation'

import { ensureDemoMatch } from '@/lib/demo'
import { getPayloadClient } from '@/lib/payload-client'

export const dynamic = 'force-dynamic'

// Ingebouwde demo: zorgt (idempotent) voor twee demo-ploegen met 8 spelers + een propere
// demo-wedstrijd, en stuurt meteen door naar het aantekenscherm. Altijd speelbaar via het menu.
export default async function DemoPage() {
  const payload = await getPayloadClient()
  const matchId = await ensureDemoMatch(payload)
  redirect(`/scorekeeper/${matchId}`)
}
