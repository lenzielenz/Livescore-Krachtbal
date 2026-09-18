import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { hasRole, isFederationLevel, userClubId } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { ensureClubDemoScreens, getClubDemoScreens, getClubFieldScreens } from '@/lib/field-screens-data'
import { hasFunctionGrant } from '@/lib/function-grants'
import { getPayloadClient } from '@/lib/payload-client'
import { VeldschermManager } from './VeldschermManager'
import './veldscherm-beheer.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Veldscherm — Krachtbal Live' }

// Club-beheerder heeft dit altijd; club-medewerker (en eender wie anders) enkel met een expliciete
// toekenning voor 'club/veldscherm' op /beheer/rechten — zie lib/function-grants.ts.
export default async function VeldschermBeheerPage() {
  const me = await getAuthUser()
  const myClub = userClubId(me)
  const payload = await getPayloadClient()
  const granted = await hasFunctionGrant(payload, (me as { id?: number } | null)?.id, 'club/veldscherm', myClub)
  if (!isFederationLevel(me) && !hasRole(me, 'club-beheerder') && !granted) {
    return (
      <>
        <SiteHeader active="clubs" />
        <div className="site">
          <h1 className="page-title"><span className="brand">Veldscherm</span></h1>
          <p className="empty">
            Enkel clubstaf kan het veldscherm beheren.{' '}
            <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
          </p>
        </div>
      </>
    )
  }

  if (myClub == null) {
    return (
      <>
        <SiteHeader active="clubs" />
        <div className="site">
          <h1 className="page-title"><span className="brand">Veldscherm</span></h1>
          <p className="empty">
            Je account is nog niet aan een club gekoppeld. Vraag de federatie om je gebruiker aan je
            club te koppelen.
          </p>
        </div>
      </>
    )
  }

  const screens = await getClubFieldScreens(payload, Number(myClub))
  await ensureClubDemoScreens(payload, Number(myClub))
  const demoScreens = await getClubDemoScreens(payload, Number(myClub))

  return (
    <>
      <SiteHeader active="clubs" />
      <div className="site">
        <h1 className="page-title"><span className="brand">Veldscherm</span></h1>
        <p className="empty" style={{ marginBottom: 16 }}>
          Elk veld krijgt een eigen tv-link: wachtscherm + koppelcode, tot iemand een wedstrijd
          start — dan springt ze vanzelf naar het scorebord, en weer terug zodra die afloopt.
        </p>
        <VeldschermManager clubId={Number(myClub)} screens={screens} demoScreens={demoScreens} />
      </div>
    </>
  )
}
