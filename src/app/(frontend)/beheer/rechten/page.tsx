import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { competitionWhere } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { FUNCTIES } from '@/lib/function-grants'
import { getPayloadClient } from '@/lib/payload-client'
import { RechtenManager, type Grant } from './RechtenManager'
import '../leden/leden.css'
import './rechten.css'

export const dynamic = 'force-dynamic'

const rel = (v: unknown): { id: number | null; label: string } => {
  if (v && typeof v === 'object') {
    const o = v as { id?: number; name?: unknown; email?: unknown }
    return { id: o.id ?? null, label: String(o.name ?? o.email ?? '—') }
  }
  return { id: typeof v === 'number' ? v : null, label: '—' }
}

// Federatie/admin: ken één functie (veldscherm, kantinescherm, ledenkeuring, ...) toe aan één
// gebruiker, los van diens rol — zie lib/function-grants.ts voor de volledige lijst en de motivatie
// (club-medewerker kreeg tot nu automatisch alle clubtools; dat wordt vervangen door deze expliciete
// toekenning per functie, club-beheerder behoudt zijn volledige toegang).
export default async function RechtenPage() {
  const me = await getAuthUser()
  if (!isFederationLevel(me)) {
    return (
      <>
        <SiteHeader active="federatie" />
        <div className="site">
          <h1 className="page-title"><span className="brand">Rechten</span></h1>
          <p className="empty">
            Enkel de federatie/admin kan functies toekennen.{' '}
            <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
          </p>
        </div>
      </>
    )
  }

  const payload = await getPayloadClient()
  const [usersRes, clubsRes, grantsRes] = await Promise.all([
    payload.find({ collection: 'users', sort: 'email', depth: 0, limit: 2000 }).catch(() => ({ docs: [] as Record<string, unknown>[] })),
    payload.find({ collection: 'clubs', where: competitionWhere(), sort: 'name', depth: 0, limit: 500 }).catch(() => ({ docs: [] as { id: number; name: string }[] })),
    payload.find({ collection: 'function-grants', sort: '-createdAt', depth: 1, limit: 1000 }).catch(() => ({ docs: [] as Record<string, unknown>[] })),
  ])

  const users = usersRes.docs.map((u) => ({ id: u.id as number, label: String((u as { name?: unknown }).name ?? (u as { email?: unknown }).email ?? '—') }))
  const clubs = clubsRes.docs.map((c) => ({ id: c.id as number, name: c.name as string }))

  const grants: Grant[] = grantsRes.docs.map((g) => {
    const u = rel((g as { user?: unknown }).user)
    const c = rel((g as { club?: unknown }).club)
    return { id: (g as { id: number }).id, userId: u.id ?? 0, userLabel: u.label, functie: String((g as { functie?: unknown }).functie ?? ''), clubId: c.id, clubName: c.id ? c.label : null }
  })

  return (
    <>
      <SiteHeader active="federatie" />
      <div className="site">
        <h1 className="page-title"><span className="brand">Rechten</span></h1>
        <p className="acc-page-intro">
          Ken één functie toe aan één gebruiker, zonder hem de volledige rol te geven — bv. iemand die
          enkel het veldscherm of de kantine mag bedienen, zonder club-medewerker te zijn. Club-beheerder
          en federatie/admin behouden hun volledige toegang, ongeacht wat hier staat.
        </p>
        <RechtenManager grants={grants} users={users} clubs={clubs} functies={FUNCTIES} />
      </div>
    </>
  )
}
