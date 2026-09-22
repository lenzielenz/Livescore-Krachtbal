import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { formatDateBE } from '@/lib/datetime'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import '../../wedstrijdblad.css'
import './ideeen.css'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Mijn ideeën — Krachtbal Live' }

const CATEGORIE_LABEL: Record<string, string> = {
  idea: '✨ Nieuw idee',
  change: '🛠️ Aanpassing',
  problem: '🐞 Probleem',
}

// Zelfde vijf standen als in de admin (Ideas.ts) — hier in supportertaal.
const STATUS_LABEL: Record<string, string> = {
  new: 'Nieuw',
  reviewing: 'Wordt bekeken',
  planned: 'Gepland',
  done: 'Uitgevoerd',
  declined: 'Afgewezen',
}

type MijnIdee = {
  id: number
  subject: string
  category: string
  status: string
  createdAt: string
}

// "Mijn ideeën": wat je via de ideeënbus doorgaf, met de status erbij — zo hoef je niet te vragen
// of er al iets mee gebeurd is. Enkel ideeën die je gaf tijdens ingelogd zijn (submittedBy) komen
// hier terug; anonieme inzendingen zijn niet aan een account te koppelen.
export default async function MijnIdeeenPage() {
  const authUser = await getAuthUser()
  if (!authUser) {
    return (
      <>
        <SiteHeader />
        <div className="site">
          <h1 className="page-title">💡 <span className="brand">Mijn ideeën</span></h1>
          <section className="wb-card" style={{ maxWidth: 440 }}>
            <p className="wb-sub">Log in om je ingediende ideeën te bekijken.</p>
            <Link href="/inloggen" className="wb-btn wb-btn-primary">Inloggen →</Link>
          </section>
        </div>
      </>
    )
  }

  const payload = await getPayloadClient()
  const myUserId = (authUser as { id: number }).id
  const ideeenRes = await payload
    .find({
      collection: 'ideas',
      where: { submittedBy: { equals: myUserId } },
      sort: '-createdAt',
      depth: 0,
      limit: 200,
      select: { subject: true, category: true, status: true, createdAt: true },
    })
    .catch(() => ({ docs: [] as MijnIdee[] }))
  const ideeen = ideeenRes.docs as MijnIdee[]

  return (
    <>
      <SiteHeader />
      <div className="site">
        <h1 className="page-title">💡 <span className="brand">Mijn ideeën</span></h1>
        <p className="wb-intro">
          Alles wat je via de <Link href="/ideeenbus" style={{ color: 'var(--accent)', fontWeight: 700 }}>ideeënbus</Link> doorgaf,
          met de status erbij — zo zie je meteen of er al iets mee gebeurd is.
        </p>

        {ideeen.length === 0 ? (
          <section className="wb-card" style={{ maxWidth: 440 }}>
            <p className="wb-sub">Je hebt nog niets doorgegeven.</p>
            <Link href="/ideeenbus" className="wb-btn wb-btn-primary">Naar de ideeënbus →</Link>
          </section>
        ) : (
          <ul className="mi-list">
            {ideeen.map((idee) => (
              <li key={idee.id} className="mi-item">
                <div className="mi-item-top">
                  <span className="mi-subject">{idee.subject}</span>
                  <span className={`mi-status mi-status-${idee.status}`}>{STATUS_LABEL[idee.status] ?? idee.status}</span>
                </div>
                <div className="mi-meta">
                  <span>{CATEGORIE_LABEL[idee.category] ?? idee.category}</span>
                  <span aria-hidden>·</span>
                  <span>{formatDateBE(idee.createdAt, { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
