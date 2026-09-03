import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { ROLE_OPTIONS, hasRole } from '@/lib/access'
import { competitionWhere } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { AccountsManager } from './AccountsManager'
import './accounts.css'

export const dynamic = 'force-dynamic'

const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

// Admin-only: beheer alle accounts (rol + club) — supporter, club, scheidsrechter, federatie, admin.
export default async function AccountsPage() {
  const me = await getAuthUser()
  if (!hasRole(me, 'admin')) {
    return (
      <>
        <SiteHeader active="federatie" />
        <div className="site">
          <h1 className="page-title"><span className="brand">Accounts</span></h1>
          <p className="empty">
            Enkel een admin kan accounts beheren.{' '}
            <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
          </p>
        </div>
      </>
    )
  }

  const payload = await getPayloadClient()
  const [usersRes, clubsRes, officialsRes, analyseRes] = await Promise.all([
    payload.find({ collection: 'users', sort: 'email', depth: 0, limit: 1000 }).catch(() => ({ docs: [] as Record<string, unknown>[] })),
    payload.find({ collection: 'clubs', where: competitionWhere(), sort: 'name', depth: 0, limit: 500 }).catch(() => ({ docs: [] as { id: number; name: string }[] })),
    payload.find({ collection: 'officials', where: { type: { equals: 'scheidsrechter' } }, sort: 'name', depth: 0, limit: 500 }).catch(() => ({ docs: [] as { id: number; name: string }[] })),
    // Analyse-opnames per eigenaar tellen, zodat de admin ziet wie wat opnam (en het kan samenbrengen).
    payload
      .find({ collection: 'matches', where: { analyseOnly: { equals: true } }, depth: 0, limit: 5000, pagination: false })
      .catch(() => ({ docs: [] as Record<string, unknown>[] })),
  ])

  // Tel analyse-opnames per eigenaar (analyseOwner).
  const analyseCounts: Record<number, number> = {}
  for (const m of analyseRes.docs) {
    const owner = rel((m as { analyseOwner?: unknown }).analyseOwner)
    if (owner != null) analyseCounts[owner] = (analyseCounts[owner] ?? 0) + 1
  }

  const users = usersRes.docs.map((u) => ({
    id: u.id as number,
    name: (u.name as string) ?? null,
    email: u.email as string,
    roles: Array.isArray((u as { roles?: unknown }).roles) ? ((u as { roles: string[] }).roles) : [],
    clubId: rel((u as { club?: unknown }).club),
    analyseAccess: Boolean((u as { analyseAccess?: unknown }).analyseAccess),
    trainingAccess: Boolean((u as { trainingAccess?: unknown }).trainingAccess),
    aantekenRechten: Boolean((u as { aantekenRechten?: unknown }).aantekenRechten),
    officialId: rel((u as { official?: unknown }).official),
    analyseCount: analyseCounts[u.id as number] ?? 0,
  }))
  const clubs = clubsRes.docs.map((c) => ({ id: c.id as number, name: c.name as string }))
  const officials = officialsRes.docs.map((o) => ({ id: o.id as number, name: o.name as string }))

  return (
    <>
      <SiteHeader active="federatie" />
      <div className="site">
        <h1 className="page-title"><span className="brand">Accounts</span></h1>
        <p className="acc-page-intro">
          Beheer alle accounts: ken rollen toe (supporter, club, scheidsrechter, federatie, admin), geef
          analyse- of training-toegang, koppel een club en — voor scheidsrechters — koppel hun
          scheidsrechtersdossier (zo werkt hun persoonlijke QR/code). Standaard staan de accounts
          <strong> per club</strong> gegroepeerd (in- en uitklapbaar) — filter op een club of schakel naar
          “per rol”. Geef iemand de rol <strong>club-beheerder</strong>, dan kent die binnen de eigen club
          zelf de juiste rechten toe via Clubteam-beheer. Onderaan kan je de analyse-opnames van gebruikers
          samenbrengen.
        </p>
        <AccountsManager users={users} clubs={clubs} officials={officials} roleOptions={[...ROLE_OPTIONS]} />
      </div>
    </>
  )
}
