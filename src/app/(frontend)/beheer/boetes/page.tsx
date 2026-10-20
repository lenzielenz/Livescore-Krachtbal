import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { boeteLijst, boeteVoorstellen, OPEN_STATUSSEN } from '@/lib/boetes'
import { getPayloadClient } from '@/lib/payload-client'
import { formatEuro } from '@/lib/vergoeding'
import { FederatieAlleen } from '../FederatieAlleen'
import { BoetesBeheer } from './BoetesBeheer'
import '../federatie-tools.css'
import '../../wedstrijdblad.css'

export const dynamic = 'force-dynamic'

// Boetes aan clubs (lib/boetes.ts): de voorstellen die het systeem maakte (forfait, blad te laat,
// aftrap later) beoordelen, manueel een boete opleggen, betalingen bevestigen, betwistingen beslissen.
// De boetelijst (bedragen) beheert de federatie zelf in het beheerpaneel (Federatie → Boetelijst).
export default async function BoetesPage({ searchParams }: { searchParams: Promise<{ alle?: string }> }) {
  const me = await getAuthUser()
  if (!isFederationLevel(me)) return <FederatieAlleen titel="Boetes" />
  const alle = (await searchParams).alle === '1'
  const payload = await getPayloadClient()
  // Voorstellen bijwerken bij het openen: idempotent, dus geen dubbele.
  await boeteVoorstellen(payload).catch((e) => console.error('boete-voorstellen:', e))
  const lijst = await boeteLijst(payload, alle ? {} : { status: { in: ['voorstel', ...OPEN_STATUSSEN] } })
  const soorten = (await payload.find({ collection: 'boete-soorten', where: { actief: { equals: true } }, depth: 0, limit: 100, overrideAccess: true })).docs.map((s) => ({
    id: Number(s.id),
    naam: String(s.naam),
    bedrag: Number(s.bedrag ?? 0),
  }))
  const clubs = (await payload.find({ collection: 'clubs', depth: 0, limit: 300, sort: 'name', overrideAccess: true })).docs.map((c) => ({ id: Number(c.id), naam: String(c.name) }))
  const openTotaal = lijst.filter((b) => (OPEN_STATUSSEN as readonly string[]).includes(b.status)).reduce((t, b) => t + b.bedrag, 0)
  return (
    <>
      <SiteHeader active="federatie" />
      <div className="site site-breed">
        <h1 className="page-title">💶 Boetes</h1>
        <p className="acc-page-intro">
          Het systeem stelt voor, jij beslist: pas een opgelegde boete ziet de club. Openstaand: <strong>{formatEuro(openTotaal)}</strong>.{' '}
          {soorten.length === 0 ? (
            <>
              <strong>Er is nog geen boetelijst.</strong> Zet de bedragen in <Link href="/admin/collections/boete-soorten">Federatie → Boetelijst</Link> — kies daar ook of het systeem
              ze voorstelt bij een forfait, een laattijdig blad of een latere aftrap.
            </>
          ) : (
            <Link href="/admin/collections/boete-soorten">Boetelijst bewerken →</Link>
          )}{' '}
          · {alle ? <Link href="/beheer/boetes">Enkel open →</Link> : <Link href="/beheer/boetes?alle=1">Ook afgehandelde →</Link>}
        </p>
        <BoetesBeheer lijst={lijst} soorten={soorten} clubs={clubs} />
      </div>
    </>
  )
}
