import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { eindrondeStatus } from '@/lib/competitieregels'
import { getPayloadClient } from '@/lib/payload-client'
import { REEKS_OPTIONS } from '@/lib/reeksen'
import { FederatieAlleen } from '../../beheer/FederatieAlleen'
import { ReglementBeheer, type RegelRij, type ReglementRij, type VerslagRij } from './ReglementBeheer'
import '../../beheer/federatie-tools.css'

export const dynamic = 'force-dynamic'

const relId = (v: unknown): number | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null || !Number.isFinite(Number(id)) ? null : Number(id)
}
const dag = (v: unknown) => (v ? new Date(String(v)).toISOString().slice(0, 10) : '')

// Het reglement is heilig: hier zet de federatie de geldende versie, de verslagen die erbij horen,
// en de regels als bouwstenen die het platform uitvoert (vastspelen, eindrondes). Elke regel wijst
// naar zijn bron.
export default async function ReglementBeheerPage() {
  const me = await getAuthUser()
  if (!isFederationLevel(me)) return <FederatieAlleen titel="Reglement" />

  const payload = await getPayloadClient()
  const [rs, vs, gs, teams] = await Promise.all([
    payload.find({ collection: 'reglementen', sort: '-geldigVanaf', depth: 0, limit: 50, overrideAccess: true }),
    payload.find({ collection: 'reglement-verslagen', sort: '-datum', depth: 0, limit: 200, overrideAccess: true }),
    payload.find({ collection: 'competitieregels', sort: 'naam', depth: 0, limit: 100, overrideAccess: true }),
    payload.find({ collection: 'teams', where: { analyseOnly: { not_equals: true } }, depth: 0, limit: 3000, pagination: false, overrideAccess: true }),
  ])
  const telling = new Map<string, number>()
  for (const t of teams.docs) if (t.reeks) telling.set(String(t.reeks), (telling.get(String(t.reeks)) ?? 0) + 1)

  const reglementen: ReglementRij[] = rs.docs.map((r) => ({
    id: Number(r.id),
    titel: String(r.titel),
    geldigVanaf: dag(r.geldigVanaf),
    status: String(r.status),
    bron: String(r.bron ?? ''),
    inhoud: String(r.inhoud ?? ''),
  }))
  const verslagen: VerslagRij[] = vs.docs.map((v) => ({
    id: Number(v.id),
    titel: String(v.titel),
    datum: dag(v.datum),
    reglement: relId(v.reglement),
    artikel: String(v.artikel ?? ''),
    status: String(v.status),
    inhoud: String(v.inhoud ?? ''),
  }))
  const regels: RegelRij[] = await Promise.all(
    gs.docs.map(async (g) => {
      const st = g.soort === 'eindronde' && g.actief ? await eindrondeStatus(payload, g as never).catch(() => null) : null
      return {
        id: Number(g.id),
        naam: String(g.naam),
        soort: String(g.soort),
        actief: Boolean(g.actief),
        reglement: relId(g.reglement),
        verslag: relId(g.verslag),
        artikel: String(g.artikel ?? ''),
        maxKeerHoger: g.maxKeerHoger ?? null,
        categorie: String(g.categorie ?? 'alle'),
        bronReeksen: (g.bronReeksen ?? []) as string[],
        topPerReeks: g.topPerReeks ?? null,
        eindrondeNaam: String(g.eindrondeNaam ?? ''),
        heenEnTerug: Boolean(g.heenEnTerug),
        dagenNaEinde: g.dagenNaEinde ?? 7,
        eindronde: st ? { klaar: st.klaar, resterend: st.resterend, bestaat: st.bestaat, doorgaan: st.doorgaan.length } : null,
      }
    }),
  )

  return (
    <>
      <SiteHeader active="federatie" />
      <div className="site site-breed">
        <h1 className="page-title">📖 Reglement &amp; regels</h1>
        <p className="acc-page-intro">
          Wat in het reglement staat, geldt. Zet hier de nieuwe versie, de verslagen met wijzigingen, en de regels die het
          platform zelf toepast — elk met zijn bron. Zo weet het systeem bv. wanneer iemand vastgespeeld is, en maakt het zelf de
          eindronde aan zodra de reeksen uitgespeeld zijn. Publiek: <Link href="/reglement">/reglement</Link>.
        </p>
        <ReglementBeheer
          reglementen={reglementen}
          verslagen={verslagen}
          regels={regels}
          reeksen={REEKS_OPTIONS.map((o) => ({ value: o.value, label: o.label, ploegen: telling.get(o.value) ?? 0 }))}
        />
      </div>
    </>
  )
}
