import { redirect } from 'next/navigation'

import { hasRole } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { ensureDemoMatch } from '@/lib/demo'
import { getPayloadClient } from '@/lib/payload-client'

export const dynamic = 'force-dynamic'

// Demo expert (admin-only): dezelfde demo-wedstrijd, maar geopend met de volledige
// scoreopnemer (3-staps veldschema) i.p.v. de basisversie. Wie geen admin is, krijgt
// gewoon de normale (basis) demo.
export default async function DemoExpertPage() {
  const user = await getAuthUser()
  if (!hasRole(user, 'admin')) redirect('/demo')

  const payload = await getPayloadClient()
  const matchId = await ensureDemoMatch(payload)
  redirect(`/scorekeeper/${matchId}?expert=1`)
}
