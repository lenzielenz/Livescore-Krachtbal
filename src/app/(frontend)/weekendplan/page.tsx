import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { userClubId } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { InstagramWeekendCard } from '../club/InstagramWeekendCard'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Mijn weekendplan — Krachtbal Live' }

export default async function WeekendplanPage() {
  const user = await getAuthUser()
  const clubId = userClubId(user)

  return (
    <>
      <SiteHeader />
      <main className="site">
        <h1 className="page-title">📲 <span className="brand">Mijn weekendplan</span></h1>
        {!user ? (
          <p className="empty">
            <Link href="/inloggen">Log in</Link> om het weekendplan van je club te downloaden.
          </p>
        ) : clubId == null ? (
          <p className="empty">
            Kies eerst je club bij <Link href="/profiel">Mijn profiel</Link>. Daarna staat hier automatisch
            het volledige weekendprogramma in de kleuren van je club.
          </p>
        ) : (
          <InstagramWeekendCard />
        )}
      </main>
    </>
  )
}
