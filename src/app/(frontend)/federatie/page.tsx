import { ProfileTools } from '@/components/ProfileTools'
import { SiteHeader } from '@/components/SiteHeader'
import { getProfile } from '@/lib/profiles'

export const dynamic = 'force-dynamic'

// Instappunt voor de federatie: van hieruit vind je beheer, planning, reglement,
// knipjes en de bekerfinale. De tools komen uit lib/profiles (gedeeld met de header).
export default function FederatiePage() {
  const profile = getProfile('federatie')
  return (
    <>
      <SiteHeader active="federatie" />
      <div className="site">
        <h1 className="page-title">
          <span className="brand">Federatie</span>
        </h1>
        <p className="profile-lead">{profile.intro}</p>
        <ProfileTools profile={profile} />
      </div>
    </>
  )
}
