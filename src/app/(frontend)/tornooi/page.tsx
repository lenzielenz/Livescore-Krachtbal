import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { CATEGORY_OPTIONS } from '@/lib/categories'
import { getPayloadClient } from '@/lib/payload-client'
import './tornooi.css'

export const dynamic = 'force-dynamic'

const catLabel = (v: unknown) => CATEGORY_OPTIONS.find((o) => o.value === v)?.label ?? String(v ?? '')

// Tornooi-hub: het ene scherm waar alles onder zit. Lijst van tornooien + knop om er een te maken.
export default async function TornooiHub() {
  const payload = await getPayloadClient()
  const res = await payload
    .find({ collection: 'tournaments', sort: '-createdAt', depth: 0, limit: 100 })
    .catch(() => ({ docs: [] as Array<{ id: number; name: string; category: string; status: string; teamCount?: number | null }> }))

  const live = res.docs.filter((t) => t.status === 'live')
  const done = res.docs.filter((t) => t.status === 'finished')

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
      <div className="trn-actions">
        <Link href="/tornooi/nieuw" className="trn-btn primary">+ Nieuwe beker</Link>
      </div>

      <main className="trn-hub">
        <Section title="Lopende bekers & tornooien" docs={live} empty="Geen lopende beker. Maak er een aan." />
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
