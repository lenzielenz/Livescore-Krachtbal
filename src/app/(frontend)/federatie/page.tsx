import Link from 'next/link'

import { ProfileTools } from '@/components/ProfileTools'
import { SiteHeader } from '@/components/SiteHeader'
import { hasRole, isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { getProfile } from '@/lib/profiles'

export const dynamic = 'force-dynamic'

// Instappunt voor de federatie: van hieruit vind je beheer, planning, reglement,
// knipjes en de bekerfinale. De tools komen uit lib/profiles (gedeeld met de header).
// Enkel federatie/admin krijgen de hub; admin-only tools verschijnen alleen voor admins.
export default async function FederatiePage() {
  const me = await getAuthUser()
  if (!isFederationLevel(me)) {
    return (
      <>
        <SiteHeader active="federatie" />
        <div className="site">
          <h1 className="page-title"><span className="brand">Federatie</span></h1>
          <p className="empty">
            Enkel de federatie/admin heeft toegang tot dit luik.{' '}
            <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
          </p>
        </div>
      </>
    )
  }

  const profile = getProfile('federatie')
  return (
    <>
      <SiteHeader active="federatie" />
      <div className="site">
        <h1 className="page-title">
          <span className="brand">Federatie</span>
        </h1>
        <p className="profile-lead">{profile.intro}</p>
        <ProfileTools profile={profile} isAdmin={hasRole(me, 'admin')} />
      </div>
    </>
  )
}
