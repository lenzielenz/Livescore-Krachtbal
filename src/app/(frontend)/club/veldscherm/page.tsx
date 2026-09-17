import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { isClubStaff, isFederationLevel, userClubId } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { getClubFieldScreens } from '@/lib/field-screens-data'
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
  const clubDoc = await payload.findByID({ collection: 'clubs', id: Number(myClub), depth: 0 }).catch(() => null)
  const screens = await getClubFieldScreens(payload, Number(myClub))

  return (
    <>
      <SiteHeader active="clubs" />
      <div className="site">
        <h1 className="page-title"><span className="brand">Veldscherm</span></h1>
        <p className="empty" style={{ marginBottom: 16 }}>
          Elk veld krijgt een eigen tv-link. Open die op de tv — zolang er niets gekoppeld is, toont
          ze de dagplanning van <strong>{clubDoc?.name ?? 'je club'}</strong> plus een koppelcode.
          Start iemand een wedstrijd, dan voert die de code van het juiste veld in en springt dat
          scherm vanzelf naar het scorebord. Loopt de wedstrijd af, dan verschijnt een nieuwe code.
        </p>
        <VeldschermManager clubId={Number(myClub)} screens={screens} />
      </div>
    </>
  )
}
