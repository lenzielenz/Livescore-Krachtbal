import { headers } from 'next/headers'
import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { CATEGORY_OPTIONS } from '@/lib/categories'
import { getPayloadClient } from '@/lib/payload-client'
import './tornooi.css'

export const dynamic = 'force-dynamic'

const catLabel = (v: unknown) => CATEGORY_OPTIONS.find((o) => o.value === v)?.label ?? String(v ?? '')

// Bekerwedstrijden-hub: lijst van bekers/tornooien. Enkel de federatie maakt er aan; supporters
// kijken mee.
export default async function TornooiHub() {
  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: await headers() }).catch(() => ({ user: null }))
  const canCreate = isFederationLevel(user)
  const res = await payload
    .find({ collection: 'tournaments', sort: '-createdAt', depth: 0, limit: 100 })
    .catch(() => ({ docs: [] as Array<{ id: number; name: string; category: string; status: string; teamCount?: number | null }> }))

  // Tornooidagen (hoofdgroepen) eerst: alle reeksen met dezelfde groepsnaam als één kaartenrij,
  // met de link naar hun eigen publieke pagina en kantinescherm. De rest blijft los staan.
  const docs = res.docs as Array<{ id: number; name: string; category: string; status: string; teamCount?: number | null; groep?: string | null }>
  const groepen = new Map<string, typeof docs>()
  const los: typeof docs = []
  for (const t of docs) {
    const g = typeof t.groep === 'string' ? t.groep.trim() : ''
    if (g) {
      const arr = groepen.get(g) ?? []
      arr.push(t)
      groepen.set(g, arr)
    } else {
      los.push(t)
    }
  }
  const live = los.filter((t) => t.status === 'live')
  const done = los.filter((t) => t.status === 'finished')

  return (
    <>
      <SiteHeader active="tornooi" />
      <div className="trn-page">
      <div className="trn-hub-head">
        <h1 className="trn-hub-title">🏆 Bekerwedstrijden</h1>
        <p className="trn-hub-intro">
          Beker- en tornooiwedstrijden in een boomstructuur — voor elke reeks. Maak een nieuwe beker aan,
          kies de ploegen, en volg de hele bracket (van de eerste ronde tot de finale) live mee.
        </p>
      </div>
      {canCreate && (
        <div className="trn-actions">
          <Link href="/tornooi/nieuw" className="trn-btn primary">+ Nieuwe beker</Link>
        </div>
      )}

      <main className="trn-hub">
        {[...groepen.entries()].map(([groep, reeksen]) => (
          <section key={groep} className="trn-hub-sec">
            <h2>
              🏆 {groep}{' '}
              <Link href={`/tornooi/groep/${encodeURIComponent(groep)}`} style={{ color: 'var(--accent)' }}>overzicht</Link>
              {' · '}
              <Link href={`/tornooi/groep/${encodeURIComponent(groep)}/kantine`} style={{ color: 'var(--accent)' }}>📺 kantinescherm</Link>
            </h2>
            <div className="trn-hub-list">
              {reeksen.map((t) => (
                <Link key={t.id} href={`/tornooi/${t.id}`} className="trn-hub-card">
                  <span className="trn-hub-name">{t.name}</span>
                  <span className="trn-hub-meta">{catLabel(t.category)} · {t.teamCount ?? '?'} ploegen</span>
                  <span className={`trn-hub-status ${t.status}`}>{t.status === 'live' ? 'BEZIG' : 'AFGELOPEN'}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
        <Section title="Lopende bekers & tornooien" docs={live} empty={groepen.size > 0 ? '' : 'Geen lopende beker. Maak er een aan.'} />
        {done.length > 0 && <Section title="Afgelopen bekers & tornooien" docs={done} empty="" />}
      </main>
      </div>
    </>
  )
}

function Section({
  title,
  docs,
  empty,
}: {
  title: string
  docs: Array<{ id: number; name: string; category: string; status: string; teamCount?: number | null }>
  empty: string
}) {
  return (
    <section className="trn-hub-sec">
      <h2>{title}</h2>
      {docs.length === 0 ? (
        <p className="trn-empty">{empty}</p>
      ) : (
        <div className="trn-hub-list">
          {docs.map((t) => (
            <Link key={t.id} href={`/tornooi/${t.id}`} className="trn-hub-card">
              <span className="trn-hub-name">{t.name}</span>
              <span className="trn-hub-meta">
                {catLabel(t.category)} · {t.teamCount ?? '?'} ploegen
              </span>
              <span className={`trn-hub-status ${t.status}`}>{t.status === 'live' ? 'BEZIG' : 'AFGELOPEN'}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
