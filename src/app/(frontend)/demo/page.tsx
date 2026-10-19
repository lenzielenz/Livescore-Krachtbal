import { redirect } from 'next/navigation'

import { ensureDemoMatch } from '@/lib/demo'
import { getPayloadClient } from '@/lib/payload-client'
import { isSupportersMode } from '@/lib/score-mode'

export const dynamic = 'force-dynamic'

// Ingebouwde demo: zorgt (idempotent) voor twee demo-ploegen met 8 spelers + een propere
// demo-wedstrijd, en stuurt meteen door naar het aantekenscherm. In supportersmodus staat de
// demo uit: aantekenen kent iedereen intussen, en een oefenwedstrijd verwart enkel.
export default async function DemoPage() {
  const payload = await getPayloadClient()
  if (await isSupportersMode(payload)) redirect('/')
  const matchId = await ensureDemoMatch(payload)
  redirect(`/scorekeeper/${matchId}`)
}
