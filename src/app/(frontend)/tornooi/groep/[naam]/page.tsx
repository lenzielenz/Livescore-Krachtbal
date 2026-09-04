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
import { huidigeOpdracht } from '@/lib/foto-voortgang'

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

  // Pronostiekstand van de dag (zelfde puntensysteem als de competitie). Op deze pagina tonen
  // we enkel wie leidt; de volledige rangschikking staat op /pronostiek.
  const stand = await tornooiPronostiekStand(payload, naam).catch(() => [])
  const standTop = stand.length > 0 ? `${stand[0].name} leidt` : ''

  // De foto-opdracht die déze deelnemer nu aan de beurt heeft. Server-side, want elke deelnemer
  // heeft zijn eigen geschudde reeks en zijn voortgang volgt uit zijn ingestuurde foto's — niet
  // uit iets in zijn browser. Wie niet ingelogd is krijgt geen opdracht: meedoen kan enkel
  // ingelogd.
  const opdracht = user
    ? await huidigeOpdracht(payload, naam, (user as { id: number }).id).catch(() => null)
    : null

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
            (programma + pronostiek), daaronder — enkel voor de organisatie — het beheer. De
            foto-opdracht staat er bewust náást als één eigen kaart: opdracht, uitleg en de twee
            manieren om in te sturen horen samen, anders oogt het rommelig en doet niemand mee. */}
        <div className="trn-balk">
          <div className="trn-balk-rij">
            <Link href={`/tornooi/groep/${encodeURIComponent(naam)}/programma`} className="trn-btn primary">
              📋 Dagprogramma
            </Link>
            {/* Alle standen van de dag op één pagina: anders moet je elke categorie apart
                opzoeken om te zien hoe jouw ploeg ervoor staat. */}
            <Link href={`/tornooi/groep/${encodeURIComponent(naam)}/rangschikking`} className="trn-btn">
              📊 Rangschikking
            </Link>
            {/* Eigen pagina met de volledige pronostiekrangschikking van de hele dag. */}
            <Link href={`/tornooi/groep/${encodeURIComponent(naam)}/pronostiek`} className="trn-btn">
              🔮 Pronostiekstand{standTop ? ` · ${standTop}` : ''}
            </Link>
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

        <FotoUpload groep={naam} opdracht={opdracht} />

        <main className="trn-hub">
          <GroepSectie titel="Categorieën" docs={live} canManage={canManage} gestart={gestart} />
          {done.length > 0 && <GroepSectie titel="Afgelopen" docs={done} canManage={canManage} gestart={gestart} />}

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
        {docs.map((t) => {
          const b = tornooiBadge(t.status, gestart.has(Number(t.id)))
          const ploegen = (t.teamCount as number | null) ?? null
          return (
            // De staat kleurt de hele kaart, niet enkel het etiketje: een reeks die bezig is hoort
            // er anders uit te zien dan een die nog moet beginnen. Zo zie je van op afstand waar
            // er iets te beleven valt.
            <Link key={String(t.id)} href={`/tornooi/${t.id}`} className={`trn-hub-card ${b.cls}`}>
              {/* De categorie groot en doorschijnend in de achtergrond: vult de lege kaart zonder
                  iets te verbergen, en maakt in één blik duidelijk om welke leeftijd het gaat. */}
              <span className="trn-hub-watermerk" aria-hidden>{catLabel(t.category)}</span>
              <span className="trn-hub-name">{String(t.name ?? '')}</span>
              <span className="trn-hub-meta">
                {catLabel(t.category)}
                {ploegen != null && <> · {ploegen} ploeg{ploegen === 1 ? '' : 'en'}</>}
              </span>
              <span className={`trn-hub-status ${b.cls}`}>
                {/* Een kloppend bolletje bij LIVE — hetzelfde teken als op het scorebord. */}
                {b.live && <span className="trn-hub-dot" aria-hidden />}
                {b.label}
              </span>
              {canManage && <VerwijderTornooi id={Number(t.id)} naam={String(t.name ?? '')} />}
            </Link>
          )
        })}
      </div>
    </section>
  )
}
