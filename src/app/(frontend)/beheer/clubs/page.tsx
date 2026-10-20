import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { relId } from '@/lib/federatie-api'
import { getPayloadClient } from '@/lib/payload-client'
import { FederatieAlleen } from '../FederatieAlleen'
import { ClubsBeheer, type ClubRij } from './ClubsBeheer'
import '../federatie-tools.css'

export const dynamic = 'force-dynamic'

// Clubs & logins: elke club met haar ploegen en wie ze beheert. Een club aanmaken en een
// clubbeheerder uitnodigen gebeurt hier in één stap; de uitnodiging is een eenmalige link.
export default async function ClubsPage() {
  const me = await getAuthUser()
  if (!isFederationLevel(me)) return <FederatieAlleen titel="Clubs & logins" />

  const payload = await getPayloadClient()
  const [clubs, teams, beheerders] = await Promise.all([
    payload.find({ collection: 'clubs', where: { analyseOnly: { not_equals: true } }, sort: 'name', depth: 0, limit: 500, pagination: false, overrideAccess: true }),
    payload.find({ collection: 'teams', where: { analyseOnly: { not_equals: true } }, depth: 0, limit: 3000, pagination: false, overrideAccess: true }),
    payload.find({ collection: 'users', where: { roles: { contains: 'club-beheerder' } }, depth: 0, limit: 3000, pagination: false, overrideAccess: true }),
  ])
  const ploegen = new Map<number, number>()
  for (const t of teams.docs) {
    const c = relId(t.club)
    if (c != null) ploegen.set(c, (ploegen.get(c) ?? 0) + 1)
  }
  const perClub = new Map<number, string[]>()
  for (const u of beheerders.docs) {
    const c = relId(u.club)
    if (c != null) perClub.set(c, [...(perClub.get(c) ?? []), String(u.name || u.email)])
  }
  const rijen: ClubRij[] = clubs.docs.map((c) => ({
    id: Number(c.id),
    naam: String(c.name ?? ''),
    plaats: String(c.plaats ?? ''),
    ploegen: ploegen.get(Number(c.id)) ?? 0,
    beheerders: perClub.get(Number(c.id)) ?? [],
  }))

  return (
    <>
      <SiteHeader active="federatie" />
      <div className="site">
        <h1 className="page-title">Clubs &amp; logins</h1>
        <p className="acc-page-intro">
          Elke club heeft minstens één clubbeheerder nodig: die registreert de leden, maakt de opstellingen en geeft zijn eigen
          medewerkers een rol. Uitnodigen geeft een eenmalige link (24 uur geldig) die je zelf doorstuurt.
        </p>
        <ClubsBeheer clubs={rijen} />
      </div>
    </>
  )
}
