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
  return (
    <>
      <SiteHeader active="tornooi" />
      <div className="trn-page">
        <NewTournament categories={CATEGORY_OPTIONS} />
      </div>
    </>
  )
}
