import Link from 'next/link'
import { notFound } from 'next/navigation'

import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { CATEGORY_OPTIONS } from '@/lib/categories'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { VerwijderTornooi } from '../../VerwijderTornooi'
import '../../tornooi.css'

export const dynamic = 'force-dynamic'

const catLabel = (v: unknown) => CATEGORY_OPTIONS.find((o) => o.value === v)?.label ?? String(v ?? '')

// Publieke pagina van een tornooidag ("Beker van Brugge"): alle reeksen van jeugd tot dames en
// heren op één plek, elk met een link naar hun schema. Alleen-lezen — bezoekers volgen hier alles
// zonder iets te kunnen aanpassen; wie aan het veld de score doorgeeft, doet dat via de
// aantekenknoppen op de reekspagina zelf (achter login). Deze link staat bewust NIET op de
// hoofdpagina: je deelt ze met wie erbij is.
export default async function TornooiGroepPage({ params }: { params: Promise<{ naam: string }> }) {
  const { naam: ruw } = await params
  const naam = decodeURIComponent(ruw).trim()
  if (!naam) notFound()

  const payload = await getPayloadClient()
  const canManage = isFederationLevel(await getAuthUser())
  const res = await payload
    .find({ collection: 'tournaments', where: { groep: { equals: naam } }, sort: 'createdAt', depth: 0, limit: 50 })
    .catch(() => ({ docs: [] }))
  const docs = res.docs as unknown as Record<string, unknown>[]
  if (docs.length === 0) notFound()

  const live = docs.filter((t) => t.status === 'live')
  const done = docs.filter((t) => t.status === 'finished')

  return (
    <>
      <SiteHeader active="tornooi" />
      <div className="trn-page">
        <div className="trn-hub-head">
          <h1 className="trn-hub-title">🏆 {naam}</h1>
          <p className="trn-hub-intro">
            Tik een categorie aan voor het volledige schema en de live scores.
          </p>
        </div>
        <div className="trn-actions">
          <Link href={`/tornooi/groep/${encodeURIComponent(naam)}/kantine`} className="trn-btn primary">
            📺 Kantinescherm (hele dag)
          </Link>
        </div>

        <main className="trn-hub">
          <GroepSectie titel="Categorieën" docs={live} canManage={canManage} />
          {done.length > 0 && <GroepSectie titel="Afgelopen" docs={done} canManage={canManage} />}
        </main>
      </div>
    </>
  )
}

function GroepSectie({ titel, docs, canManage = false }: { titel: string; docs: Record<string, unknown>[]; canManage?: boolean }) {
  if (docs.length === 0) return null
  return (
    <section className="trn-hub-sec">
      <h2>{titel}</h2>
      <div className="trn-hub-list">
        {docs.map((t) => (
          <Link key={String(t.id)} href={`/tornooi/${t.id}`} className="trn-hub-card">
            <span className="trn-hub-name">{String(t.name ?? '')}</span>
            <span className="trn-hub-meta">
              {catLabel(t.category)} · {(t.teamCount as number | null) ?? '?'} ploegen
            </span>
            <span className={`trn-hub-status ${String(t.status)}`}>
              {t.status === 'live' ? 'BEZIG' : 'AFGELOPEN'}
            </span>
            {canManage && <VerwijderTornooi id={Number(t.id)} naam={String(t.name ?? '')} />}
          </Link>
        ))}
      </div>
    </section>
  )
}
