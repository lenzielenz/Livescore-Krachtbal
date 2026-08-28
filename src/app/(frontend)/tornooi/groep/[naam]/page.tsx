import Link from 'next/link'
import { notFound } from 'next/navigation'

import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { CATEGORY_OPTIONS } from '@/lib/categories'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { gestarteTornooien, tornooiBadge } from '@/lib/tornooi-status'
import { tornooiPronostiekStand } from '@/lib/tornooi-pronostiek'
import { VerwijderTornooi } from '../../VerwijderTornooi'
import { FotoUpload } from './FotoUpload'
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
  const user = await getAuthUser()
  const canManage = isFederationLevel(user)
  const res = await payload
    .find({ collection: 'tournaments', where: { groep: { equals: naam } }, sort: 'createdAt', depth: 0, limit: 50 })
    .catch(() => ({ docs: [] }))
  const docs = res.docs as unknown as Record<string, unknown>[]
  if (docs.length === 0) notFound()

  const live = docs.filter((t) => t.status === 'live')
  const done = docs.filter((t) => t.status === 'finished')
  // "Bezig" pas wanneer er écht gespeeld wordt — anders "Nog niet gestart".
  const gestart = await gestarteTornooien(payload, docs.map((t) => Number(t.id)))

  // Pronostiekstand van de dag (zelfde puntensysteem als de competitie).
  const stand = await tornooiPronostiekStand(payload, naam).catch(() => [])

  // Ingestuurde supportersfoto's: de federatie ziet meteen hoeveel er al binnen zijn.
  const fotoRes = canManage
    ? await payload
        .find({ collection: 'tornooi-fotos', where: { groep: { equals: naam } }, limit: 0, depth: 0 })
        .catch(() => ({ totalDocs: 0 }))
    : { totalDocs: 0 }

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
        {/* Eén nette actiebalk i.p.v. losse knoppen door elkaar: eerst wat iederéén nodig heeft
            (programma + foto's), daaronder — enkel voor de organisatie — het beheer. */}
        <div className="trn-balk">
          <div className="trn-balk-rij">
            <Link href={`/tornooi/groep/${encodeURIComponent(naam)}/programma`} className="trn-btn primary">
              📋 Dagprogramma
            </Link>
            <FotoUpload groep={naam} ingelogd={Boolean(user)} />
          </div>
          {canManage && (
            <div className="trn-balk-rij beheer">
              <span className="trn-balk-lbl">Organisatie</span>
              <Link href={`/tornooi/groep/${encodeURIComponent(naam)}/kantine`} className="trn-btn">
                📺 Kantinescherm
              </Link>
              <Link href={`/tornooi/groep/${encodeURIComponent(naam)}/fotos`} className="trn-btn">
                📷 Foto’s ({fotoRes.totalDocs})
              </Link>
              <Link href={`/tornooi/nieuw?groep=${encodeURIComponent(naam)}`} className="trn-btn">
                + Categorie
              </Link>
            </div>
          )}
        </div>

        <main className="trn-hub">
          <GroepSectie titel="Categorieën" docs={live} canManage={canManage} gestart={gestart} />
          {done.length > 0 && <GroepSectie titel="Afgelopen" docs={done} canManage={canManage} gestart={gestart} />}

          {/* Pronostiekstand van de dag — zelfde punten als de competitie (exact 10, resultaat +
              saldo 6, resultaat 3, nabijheid tot 3, dichtste-bij 2). */}
          {stand.length > 0 && (
            <section className="trn-hub-sec">
              <h2>🔮 Pronostiekstand</h2>
              <ol className="tp-stand">
                {stand.slice(0, 15).map((r, i) => (
                  <li key={r.userId} className={i === 0 ? 'leider' : ''}>
                    <span className="tp-plaats">{i + 1}</span>
                    <span className="tp-naam">{r.name}</span>
                    <span className="tp-detail">
                      {r.predictions} tip{r.predictions === 1 ? '' : 's'}
                      {r.exact > 0 ? ` · ${r.exact}× exact` : ''}
                    </span>
                    <span className="tp-punten">{r.points}</span>
                  </li>
                ))}
              </ol>
              <p className="trn-hint">
                Exact = 10 punten · juiste winnaar én saldo = 6 · juiste winnaar = 3 · dichtst bij = 2 bonus.
              </p>
            </section>
          )}
        </main>
      </div>
    </>
  )
}

function GroepSectie({ titel, docs, canManage = false, gestart }: { titel: string; docs: Record<string, unknown>[]; canManage?: boolean; gestart: Set<number> }) {
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
            {(() => {
              const b = tornooiBadge(t.status, gestart.has(Number(t.id)))
              return <span className={`trn-hub-status ${b.cls}`}>{b.label}</span>
            })()}
            {canManage && <VerwijderTornooi id={Number(t.id)} naam={String(t.name ?? '')} />}
          </Link>
        ))}
      </div>
    </section>
  )
}
