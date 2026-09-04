import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel, magTornooiAantekenen } from '@/lib/access'
import { CATEGORY_OPTIONS } from '@/lib/categories'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { gestarteTornooien, tornooiBadge } from '@/lib/tornooi-status'
import { UITLEG_PAD } from '@/lib/aantekenen-uitleg'
import { VerwijderTornooi } from './VerwijderTornooi'
import './tornooi.css'

export const dynamic = 'force-dynamic'

const catLabel = (v: unknown) => CATEGORY_OPTIONS.find((o) => o.value === v)?.label ?? String(v ?? '')

// Bekerwedstrijden-hub: lijst van bekers/tornooien. Enkel de federatie maakt er aan; supporters
// kijken mee.
export default async function TornooiHub() {
  const payload = await getPayloadClient()
  const user = await getAuthUser()
  const canCreate = isFederationLevel(user)
  // De uitleg over aantekenen is voor wie het ook mág doen — dezelfde kring die op het
  // dagprogramma een Aantekenen-knop ziet (zie tornooi/[id]/page.tsx). Een supporter komt hier
  // om het schema te volgen; die heeft niets aan een handleiding voor de tafel.
  const magAantekenen = magTornooiAantekenen(user)
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
  // "Bezig" pas wanneer er écht gespeeld wordt — anders "Nog niet gestart".
  const gestart = await gestarteTornooien(payload, docs.map((t) => t.id))

  return (
    <>
      <SiteHeader active="tornooi" />
      <div className="trn-page">
      <div className="trn-hub-head">
        <h1 className="trn-hub-title">🏆 Tornooien</h1>
        <p className="trn-hub-intro">
          Open een tornooi en je ziet de categorieën (senioren, U12, U14 …) met hun volledige
          schema — van de eerste ronde tot de finale, live te volgen.
        </p>
      </div>
      {(magAantekenen || canCreate) && (
        <div className="trn-actions">
          {/* Voor wie straks achter de tafel zit: stappenplan, oefenversie en een handleiding om
              af te drukken. */}
          {magAantekenen && (
            <Link href={UITLEG_PAD} className="trn-btn">📖 Hoe teken ik een wedstrijd aan?</Link>
          )}
          {canCreate && (
            <Link href="/tornooi/nieuw" className="trn-btn primary">+ Nieuw tornooi / categorie</Link>
          )}
        </div>
      )}

      <main className="trn-hub">
        {/* Tornooi-eerst: één kaart per tornooidag. Openen = de categorieën zien (groepspagina). */}
        {groepen.size > 0 && (
          <section className="trn-hub-sec">
            <h2>Tornooien</h2>
            <div className="trn-hub-list">
              {[...groepen.entries()].map(([groep, reeksen]) => {
                // De dag is "bezig" zodra er in één van de reeksen écht gespeeld wordt;
                // allemaal afgesloten = afgelopen; anders komt hij er nog aan.
                const alleKlaar = reeksen.every((t) => t.status === 'finished')
                const b = tornooiBadge(alleKlaar ? 'finished' : 'live', reeksen.some((t) => gestart.has(t.id)))
                const cats = [...new Set(reeksen.map((t) => catLabel(t.category)))]
                return (
                  <Link key={groep} href={`/tornooi/groep/${encodeURIComponent(groep)}`} className={`trn-hub-card groep ${b.cls}`}>
                    <span className="trn-hub-name">🏆 {groep}</span>
                    <span className="trn-hub-meta">
                      {reeksen.length} {reeksen.length === 1 ? 'categorie' : 'categorieën'} · {cats.join(', ')}
                    </span>
                    <span className={`trn-hub-status ${b.cls}`}>
                      {b.live && <span className="trn-hub-dot" aria-hidden />}
                      {b.label}
                    </span>
                  </Link>
                )
              })}
            </div>
          </section>
        )}
        <Section title="Losse tornooien" docs={live} empty={groepen.size > 0 ? '' : 'Nog geen tornooi. Maak er een aan.'} canDelete={canCreate} gestart={gestart} />
        {done.length > 0 && <Section title="Afgelopen" docs={done} empty="" canDelete={canCreate} gestart={gestart} />}
      </main>
      </div>
    </>
  )
}

function Section({
  title,
  docs,
  empty,
  canDelete = false,
  gestart,
}: {
  title: string
  docs: Array<{ id: number; name: string; category: string; status: string; teamCount?: number | null }>
  empty: string
  canDelete?: boolean
  gestart: Set<number>
}) {
  return (
    <section className="trn-hub-sec">
      <h2>{title}</h2>
      {docs.length === 0 ? (
        <p className="trn-empty">{empty}</p>
      ) : (
        <div className="trn-hub-list">
          {docs.map((t) => {
            const b = tornooiBadge(t.status, gestart.has(t.id))
            return (
              <Link key={t.id} href={`/tornooi/${t.id}`} className={`trn-hub-card ${b.cls}`}>
                <span className="trn-hub-watermerk" aria-hidden>{catLabel(t.category)}</span>
                <span className="trn-hub-name">{t.name}</span>
                <span className="trn-hub-meta">
                  {catLabel(t.category)} · {t.teamCount ?? '?'} ploegen
                </span>
                <span className={`trn-hub-status ${b.cls}`}>
                  {b.live && <span className="trn-hub-dot" aria-hidden />}
                  {b.label}
                </span>
                {canDelete && <VerwijderTornooi id={t.id} naam={t.name} />}
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}
