import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { hasRole, isFederationLevel, userClubId, userFollowedClubIds } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { ensureClubDemoScreens, getClubDemoScreens, getClubFieldScreens } from '@/lib/field-screens-data'
import { hasFunctionGrant } from '@/lib/function-grants'
import { getPayloadClient } from '@/lib/payload-client'
import { VeldschermManager } from './VeldschermManager'
import './veldscherm-beheer.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Veldscherm — Krachtbal Live' }

// Twee weergaven op dezelfde pagina:
//  • clubstaf (club-beheerder, of club-medewerker/iemand anders met een toekenning voor
//    'club/veldscherm' op /beheer/rechten — zie lib/function-grants.ts) beheert de velden: aantal,
//    thema, ontkoppelen;
//  • elke ingelogde supporter ziet de veldschermen van zijn club en zet er één op een tv (link, QR,
//    koppelcode). Een wedstrijd koppelen doet hij daarna met de code op het scherm, vanaf de
//    wedstrijdpagina — de code is de eigenlijke grendel (zie /api/veldscherm/koppel).
export default async function VeldschermBeheerPage() {
  const me = await getAuthUser()
  const myClub = userClubId(me)
  const payload = await getPayloadClient()
  const granted = await hasFunctionGrant(payload, (me as { id?: number } | null)?.id, 'club/veldscherm', myClub)
  const beheer = isFederationLevel(me) || hasRole(me, 'club-beheerder') || granted

  if (!me) {
    return (
      <>
        <SiteHeader active="clubs" />
        <div className="site">
          <h1 className="page-title"><span className="brand">Veldscherm</span></h1>
          <p className="empty">
            Log in om het veldscherm van je club op een tv te zetten.{' '}
            <Link href="/inloggen?next=/club/veldscherm" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
          </p>
        </div>
      </>
    )
  }

  // Een supporter zonder eigen club kijkt naar de eerste club die hij volgt.
  const clubId = myClub ?? (beheer ? null : (userFollowedClubIds(me)[0] ?? null))
  if (clubId == null) {
    return (
      <>
        <SiteHeader active="clubs" />
        <div className="site">
          <h1 className="page-title"><span className="brand">Veldscherm</span></h1>
          <p className="empty">
            {beheer
              ? 'Je account is nog niet aan een club gekoppeld. Vraag de federatie om je gebruiker aan je club te koppelen.'
              : 'Kies eerst je club in je profiel, dan verschijnen hier de veldschermen van die club.'}{' '}
            {!beheer && <Link href="/profiel" style={{ color: 'var(--accent)' }}>Naar mijn profiel →</Link>}
          </p>
        </div>
      </>
    )
  }

  const screens = await getClubFieldScreens(payload, Number(clubId))
  // Enkel de staf maakt de demoschermen aan: een supporter die de pagina opent, schrijft niets.
  if (beheer) await ensureClubDemoScreens(payload, Number(clubId))
  const demoScreens = await getClubDemoScreens(payload, Number(clubId))

  return (
    <>
      <SiteHeader active="clubs" />
      <div className="site">
        <h1 className="page-title"><span className="brand">Veldscherm</span></h1>
        <p className="empty" style={{ marginBottom: 16 }}>
          {beheer
            ? 'Elk veld krijgt een eigen tv-link: wachtscherm + koppelcode, tot iemand een wedstrijd start — dan springt ze vanzelf naar het scorebord, en weer terug zodra die afloopt.'
            : 'Zet het scherm van een veld op de tv: open de link of scan de QR met het toestel dat de tv aanstuurt. Begint de wedstrijd, tik dan op de wedstrijdpagina op "Veldscherm koppelen" en geef de code in die op de tv staat.'}
        </p>
        <VeldschermManager clubId={Number(clubId)} screens={screens} demoScreens={demoScreens} beheer={beheer} />
      </div>
    </>
  )
}
