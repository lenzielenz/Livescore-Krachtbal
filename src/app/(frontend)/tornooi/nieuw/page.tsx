import Link from 'next/link'
import { headers } from 'next/headers'

import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { CATEGORY_OPTIONS } from '@/lib/categories'
import { getPayloadClient } from '@/lib/payload-client'
import { NewTournament } from './NewTournament'
import '../tornooi.css'

export const dynamic = 'force-dynamic'

// Aanmaakscherm: aantal ploegen → alle gegevens invullen → loting (manueel of toggle).
// Enkel de federatie/admin kan een beker/tornooi aanmaken; supporters kijken mee.
export default async function NieuwTornooiPage() {
  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: await headers() }).catch(() => ({ user: null }))
  if (!isFederationLevel(user)) {
    return (
      <>
        <SiteHeader active="tornooi" />
        <div className="trn-page">
          <p className="trn-empty">
            Enkel de federatie kan een beker of tornooi aanmaken. Supporters volgen gewoon mee.{' '}
            <Link href="/tornooi" style={{ color: 'var(--accent)' }}>← Alle bekers</Link>
          </p>
        </div>
      </>
    )
  }
  // Clubs voor de (optionele) club-koppeling per ploeg.
  const clubsRes = await payload
    .find({ collection: 'clubs', sort: 'name', depth: 0, limit: 500 })
    .catch(() => ({ docs: [] as { id: number; name?: unknown }[] }))
  const clubs = clubsRes.docs
    .map((c) => ({ id: c.id as number, name: String((c as { name?: unknown }).name ?? '') }))
    .filter((c) => c.name)

  // Echte ploegen (met spelers) zodat een tornooiploeg gekoppeld kan worden — dan gebruikt de
  // aantekentafel exact hetzelfde aantekenblad als bij een gewone wedstrijd (scorerkeuze, wissels).
  const teamsRes = await payload
    .find({ collection: 'teams', sort: 'name', depth: 1, limit: 1000 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const teams = teamsRes.docs
    .map((t) => {
      const club = (t as { club?: unknown }).club
      const clubObj = club && typeof club === 'object' ? (club as { id?: number; name?: unknown }) : null
      return {
        id: t.id as number,
        name: String((t as { name?: unknown }).name ?? ''),
        category: String((t as { category?: unknown }).category ?? ''),
        clubId: clubObj?.id ?? (typeof club === 'number' ? club : null),
        clubName: clubObj ? String(clubObj.name ?? '') : '',
      }
    })
    .filter((t) => t.name)

  return (
    <>
      <SiteHeader active="tornooi" />
      <div className="trn-page">
        <NewTournament categories={CATEGORY_OPTIONS} clubs={clubs} teams={teams} />
      </div>
    </>
  )
}
