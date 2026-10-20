import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { formatDateBE } from '@/lib/datetime'
import { getPayloadClient } from '@/lib/payload-client'
import { FederatieAlleen } from '../FederatieAlleen'
import { KlachtenBeheer, type KlachtRij } from './KlachtenBeheer'
import '../federatie-tools.css'
import '../../wedstrijdblad.css'

export const dynamic = 'force-dynamic'

// Klachten over ingediende wedstrijdbladen (lib/klacht.ts): het blad heropenen (opnieuw ondertekenen)
// of de klacht afwijzen. Beide clubs krijgen een melding.
export default async function KlachtenPage({ searchParams }: { searchParams: Promise<{ alle?: string }> }) {
  const me = await getAuthUser()
  if (!isFederationLevel(me)) return <FederatieAlleen titel="Klachten" />
  const alle = (await searchParams).alle === '1'
  const payload = await getPayloadClient()
  const res = await payload.find({
    collection: 'klachten',
    where: alle ? {} : { status: { equals: 'open' } },
    depth: 2,
    sort: '-createdAt',
    limit: 300,
    pagination: false,
    overrideAccess: true,
  })
  const naam = (t: unknown) => (t && typeof t === 'object' ? String((t as { name?: unknown }).name ?? '—') : '—')
  const lijst: KlachtRij[] = res.docs.map((k) => {
    const m = k.match && typeof k.match === 'object' ? k.match : null
    return {
      id: Number(k.id),
      matchId: Number(m?.id ?? 0),
      wedstrijd: m ? `${naam(m.homeTeam)} – ${naam(m.awayTeam)}` : '—',
      datum: m?.date ? formatDateBE(m.date) : '',
      club: naam(k.club),
      door: k.ingediendDoor && typeof k.ingediendDoor === 'object' ? String(k.ingediendDoor.name || k.ingediendDoor.email || '') : '',
      reden: String(k.reden ?? ''),
      status: String(k.status ?? 'open'),
      beslissing: k.beslissing ? String(k.beslissing) : null,
      op: String(k.createdAt),
    }
  })
  return (
    <>
      <SiteHeader active="federatie" />
      <div className="site site-breed">
        <h1 className="page-title">⚖️ Klachten over wedstrijdbladen</h1>
        <p className="acc-page-intro">
          Een club klaagt over een ingediend blad. <strong>Heropenen</strong> zet het blad terug op &quot;af te tekenen&quot;: de fout wordt
          verbeterd en beide kapiteins en de scheidsrechter tekenen opnieuw — daarna gaat het weer naar iedereen. De vorige PDF blijft
          bewaard. <strong>Afwijzen</strong> laat het ingediende blad gelden. Beide clubs krijgen een melding.{' '}
          {alle ? <Link href="/beheer/klachten">Enkel open klachten →</Link> : <Link href="/beheer/klachten?alle=1">Ook behandelde tonen →</Link>}
        </p>
        {lijst.length === 0 ? <p className="empty">Geen open klachten. ⚖️</p> : <KlachtenBeheer lijst={lijst} />}
      </div>
    </>
  )
}
