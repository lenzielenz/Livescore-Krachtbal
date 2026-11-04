import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { behandelaars } from '@/lib/dossiers'
import { aanvragenLijst } from '@/lib/federatie-aanvragen'
import { getPayloadClient } from '@/lib/payload-client'
import { Bord } from './Bord'
import './bord.css'

export const dynamic = 'force-dynamic'

// Het bord: alles wat bij de federatie binnenkomt in vier kolommen (nieuw, in behandeling, wacht op
// anderen, afgehandeld). Oppakken, doorgeven aan een collega, op wacht zetten, notities, en de
// beslissing zelf met dezelfde knoppen als op het werkscherm. Zie lib/aanvragen-bord.ts (regels),
// lib/federatie-aanvragen.ts (de lijst) en lib/dossiers.ts (de opvolging).
export default async function AanvragenPage({ searchParams }: { searchParams: Promise<{ dossier?: string; bron?: string }> }) {
  const me = await getAuthUser()
  if (!isFederationLevel(me)) {
    return (
      <>
        <SiteHeader active="federatie" />
        <div className="site site-breed">
          <h1 className="page-title">Aanvragen &amp; taken</h1>
          <p className="empty">
            Enkel de federatie heeft toegang tot dit bord. <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
          </p>
        </div>
      </>
    )
  }
  const sp = await searchParams
  const payload = await getPayloadClient()
  const [aanvragen, wie] = await Promise.all([aanvragenLijst(payload), behandelaars(payload)])
  const u = me as { id: number | string; name?: unknown; email?: unknown }
  const naam = typeof u.name === 'string' && u.name.trim() ? u.name.trim() : typeof u.email === 'string' ? u.email.split('@')[0]! : 'Ik'

  return (
    <>
      <SiteHeader active="federatie" />
      <div className="site site-breed bd-site">
        <Bord begin={aanvragen} behandelaars={wie} ik={{ id: Number(u.id), naam }} focus={sp.dossier ?? null} beginBron={sp.bron ?? null} />
      </div>
    </>
  )
}
