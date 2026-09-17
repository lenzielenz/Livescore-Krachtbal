import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { isClubStaff, isFederationLevel, userClubId } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { ensureClubDemoScreens, getClubDemoScreens, getClubFieldScreens } from '@/lib/field-screens-data'
import { getPayloadClient } from '@/lib/payload-client'
import { VeldschermManager } from './VeldschermManager'
import './veldscherm-beheer.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Veldscherm — Krachtbal Live' }

// Club-staf (beheerder + medewerker) stelt hier het aantal velden van de eigen club in en haalt
// er de scherm-URL's op — elk veld z'n eigen tv-link, met een eigen wachtscherm + koppelcode.
// Zie collections/FieldScreens.ts voor het volledige plaatje.
export default async function VeldschermBeheerPage() {
  const me = await getAuthUser()
  if (!isFederationLevel(me) && !isClubStaff(me)) {
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

  const myClub = userClubId(me)
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

  const payload = await getPayloadClient()
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
