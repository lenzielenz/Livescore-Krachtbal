import Link from 'next/link'

import { getPayloadClient } from '@/lib/payload-client'
import { BulkPlayers } from './BulkPlayers'

export const dynamic = 'force-dynamic'

export default async function BulkPlayersPage() {
  const payload = await getPayloadClient()
  const teamsRes = await payload.find({ collection: 'teams', sort: 'name', depth: 1, limit: 200 })

  const teams = teamsRes.docs.map((t) => {
    const club = typeof t.club === 'object' && t.club ? t.club.name : ''
    return { id: t.id, label: club ? `${club} — ${t.name}` : t.name }
  })

  return (
    <div className="site">
      <Link href="/admin" className="back-link">
        ← Beheer
      </Link>
      <header className="site-header">
        <h1>Spelers snel toevoegen</h1>
      </header>
      {teams.length === 0 ? (
        <p className="empty">Maak eerst een ploeg aan via Beheer.</p>
      ) : (
        <BulkPlayers teams={teams} />
      )}
    </div>
  )
}
