import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { getPayloadClient } from '@/lib/payload-client'
import { VERANTWOORDELIJKE_OPTIONS, type Verantwoordelijke } from '@/lib/bekerfinale-checklist'
import '../wedstrijdblad.css'

export const dynamic = 'force-dynamic'

type Taak = { taak?: string; verantwoordelijke?: string | null; gedaan?: boolean | null; opmerking?: string | null }

const verantwLabel = (v: string | null | undefined) =>
  VERANTWOORDELIJKE_OPTIONS.find((o) => o.value === v)?.label ?? 'Overig'

export default async function BekerfinalePage() {
  const payload = await getPayloadClient()
  const finals = await payload
    .find({ collection: 'cupfinals', sort: '-datum', limit: 50, depth: 0 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))

  return (
    <>
      <SiteHeader active="federatie" />
      <div className="site">
      <h1 className="page-title">Bekerfinales — organisatie</h1>

      {finals.docs.length === 0 ? (
        <p className="wb-intro">
          Nog geen bekerfinale aangemaakt. Maak er een aan in het <Link href="/admin">beheer</Link>; de
          standaard takenlijst (OC / Federatie / SRC) wordt automatisch ingevuld.
        </p>
      ) : (
        finals.docs.map((f) => {
          const taken = (f.checklist ?? []) as Taak[]
          const klaar = taken.filter((t) => t.gedaan).length
          const groepen = VERANTWOORDELIJKE_OPTIONS.map((o) => o.value as Verantwoordelijke)
          return (
            <section key={String(f.id)} className="wb-card" style={{ marginBottom: 16 }}>
              <h2>{String(f.titel)}</h2>
              <p className="wb-sub">
                {f.datum ? new Date(f.datum as string).toLocaleDateString('nl-BE') : 'datum n.t.b.'}
                {f.locatie ? ` · ${f.locatie}` : ''} · {klaar}/{taken.length} taken klaar
              </p>
              {groepen.map((g) => {
                const items = taken.filter((t) => (t.verantwoordelijke ?? 'OC') === g)
                if (items.length === 0) return null
                return (
                  <div key={g} style={{ marginTop: 10 }}>
                    <strong style={{ fontSize: '0.85rem' }}>{verantwLabel(g)}</strong>
                    <ul className="wb-rows" style={{ marginTop: 4 }}>
                      {items.map((t, i) => (
                        <li key={i} className="wb-row" style={{ cursor: 'default', opacity: t.gedaan ? 0.55 : 1 }}>
                          <span className="nm">{t.gedaan ? '✅' : '⬜'} {t.taak}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </section>
          )
        })
      )}
      </div>
    </>
  )
}
