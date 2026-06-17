import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { hasRole, userClubId } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { ClubTeamManager, type Member, type TeamRole } from './ClubTeamManager'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Clubteam — Krachtbal Live' }

// De federatie beheert staf/admins; die accounts raakt een club-beheerder hier niet aan.
const PROTECTED = ['admin', 'federatie', 'scheidsrechter', 'club-beheerder']

function roleOf(roles: string[]): TeamRole {
  if (roles.includes('club-medewerker')) return 'club-medewerker'
  if (roles.includes('club-lid')) return 'club-lid'
  return 'none'
}

// Clubteam-beheer: een club-beheerder geeft leden van de EIGEN club een club-rol
// (club-medewerker / lid van de club). Rollenbeheer voor staf/admins blijft bij de federatie.
export default async function ClubTeamPage() {
  const me = await getAuthUser()
  if (!hasRole(me, 'club-beheerder')) {
    return (
      <>
        <SiteHeader active="clubs" />
        <div className="site">
          <h1 className="page-title"><span className="brand">Clubteam</span></h1>
          <p className="empty">
            Enkel een club-beheerder kan het clubteam beheren.{' '}
            <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
          </p>
        </div>
      </>
    )
  }
  const myClub = userClubId(me)
  if (myClub == null) {
    return (
      <>
        <SiteHeader active="clubs" />
        <div className="site">
          <h1 className="page-title"><span className="brand">Clubteam</span></h1>
          <p className="empty">
            Je account is nog niet aan een club gekoppeld. Vraag de federatie om je gebruiker aan je
            club te koppelen.
          </p>
        </div>
      </>
    )
  }

  const payload = await getPayloadClient()
  const meId = Number((me as { id: number }).id)
  const usersRes = await payload
    .find({ collection: 'users', where: { club: { equals: myClub } }, sort: 'email', depth: 0, limit: 1000 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))

  const members: Member[] = usersRes.docs
    .map((u) => ({
      id: u.id as number,
      name: (u as { name?: string }).name ?? null,
      email: (u as { email?: string }).email ?? '',
      roles: Array.isArray((u as { roles?: unknown }).roles) ? (u as { roles: string[] }).roles : [],
    }))
    .filter((u) => u.id !== meId && !u.roles.some((r) => PROTECTED.includes(r)))
    .map((u) => ({ id: u.id, name: u.name, email: u.email, role: roleOf(u.roles) }))

  return (
    <>
      <SiteHeader active="clubs" />
      <div className="site">
        <h1 className="page-title"><span className="brand">Clubteam</span></h1>
        <p className="empty" style={{ marginBottom: 16 }}>
          Geef leden van je club een rol. <strong>Club-medewerker</strong> mag aantekenen, opstellingen
          zetten en spelers &amp; training beheren; <strong>lid van de club</strong> kan het trainingsluik
          bekijken. Leden verschijnen hier zodra ze zich registreren met jouw club. Scheidsrechters en
          federatie-accounts beheert de federatie.
        </p>
        <ClubTeamManager members={members} />
      </div>
    </>
  )
}
