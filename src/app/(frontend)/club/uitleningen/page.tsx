import Link from 'next/link'
import type { Where } from 'payload'

import { SiteHeader } from '@/components/SiteHeader'
import { hasRole, userClubId } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { huidigSeizoen, jeugdCategorie, UITLEEN_STATUS_LABEL, type UitleenStatus } from '@/lib/uitlening'
import { Uitleningen, type UitleningRij } from './Uitleningen'
import '../../beheer/federatie-tools.css'
import '../../wedstrijdblad.css'

export const dynamic = 'force-dynamic'

const JEUGD = ['U12', 'U14', 'U16', 'U18']
const relId = (v: unknown): number | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null || !Number.isFinite(Number(id)) ? null : Number(id)
}
const naam = (v: unknown) => (v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '') : '')

// Uitlenen van jeugdspelers (RCVK item 45, lib/uitlening.ts). De clubstaf stelt een overeenkomst op
// voor een eigen jeugdspeler, tekent die van een andere club, volgt de status en downloadt de getekende
// overeenkomst. Een speler (of ouder) ziet hier zijn eigen overeenkomsten.
export default async function UitleningenPage() {
  const me = await getAuthUser()
  const clubId = userClubId(me)
  const staf = hasRole(me, 'club-beheerder', 'club-medewerker') && clubId != null
  const u = me as { player?: unknown; kinderen?: unknown[] } | null
  const eigenSpelers = [relId(u?.player), ...(u?.kinderen ?? []).map(relId)].filter((x): x is number => x != null)

  if (!me || (!staf && eigenSpelers.length === 0)) {
    return (
      <>
        <SiteHeader active="clubs" />
        <div className="site site-breed">
          <h1 className="page-title">🤝 Uitleningen</h1>
          <p className="empty">
            Enkel de staf van een club, of de speler zelf, ziet de uitleningen.{' '}
            {!me && (
              <Link href="/inloggen" style={{ color: 'var(--accent)' }}>
                Inloggen →
              </Link>
            )}
          </p>
        </div>
      </>
    )
  }

  const payload = await getPayloadClient()
  const seizoen = await huidigSeizoen(payload)
  const where: Where = staf
    ? { or: [{ vanClub: { equals: Number(clubId) } }, { naarClub: { equals: Number(clubId) } }] }
    : { speler: { in: eigenSpelers } }
  const res = await payload.find({ collection: 'uitleningen', where, depth: 1, sort: '-createdAt', limit: 200, overrideAccess: true })
  const rijen: UitleningRij[] = res.docs.map((d) => ({
    id: Number(d.id),
    speler: String(d.spelerNaam ?? ''),
    categorie: String(d.categorie ?? ''),
    vanClub: naam(d.vanClub),
    naarClub: naam(d.naarClub),
    ploeg: naam(d.naarPloeg),
    competitie: String(d.competitie ?? d.seizoen ?? ''),
    status: d.status as UitleenStatus,
    statusLabel: UITLEEN_STATUS_LABEL[d.status as UitleenStatus] ?? String(d.status),
    wijUitlener: staf && relId(d.vanClub) === Number(clubId),
    wijOntvanger: staf && relId(d.naarClub) === Number(clubId),
    tekenVan: d.tekenVan?.naam ? `${d.tekenVan.naam}` : null,
    tekenNaar: d.tekenNaar?.naam ? `${d.tekenNaar.naam}` : null,
    toelichting: (d.toelichting as string | null) ?? null,
  }))

  // Voor het opstellen: eigen jeugdspelers en de jeugdploegen van andere clubs.
  let spelers: { id: number; naam: string; categorie: string }[] = []
  let ploegen: { id: number; naam: string; club: string; categorie: string }[] = []
  if (staf) {
    const [sp, pl] = await Promise.all([
      payload.find({ collection: 'players', where: { and: [{ club: { equals: Number(clubId) } }, { actief: { not_equals: false } }] }, depth: 0, limit: 1000, sort: 'name', overrideAccess: true }),
      payload.find({ collection: 'teams', where: { and: [{ club: { not_equals: Number(clubId) } }, { category: { in: JEUGD } }] }, depth: 1, limit: 1000, sort: 'name', overrideAccess: true }),
    ])
    spelers = sp.docs
      .map((p) => ({ id: Number(p.id), naam: String(p.name ?? ''), categorie: jeugdCategorie(p.birthDate, seizoen.startJaar) ?? '' }))
      .filter((p) => p.categorie)
    ploegen = pl.docs.map((t) => ({ id: Number(t.id), naam: String(t.name ?? ''), club: naam(t.club), categorie: String(t.category ?? '') }))
  }

  return (
    <>
      <SiteHeader active="clubs" />
      <div className="site site-breed">
        <h1 className="page-title">🤝 Uitleningen van jeugdspelers</h1>
        <p className="acc-page-intro">
          Een jeugdspeler kan voor één competitie bij een andere club spelen (RCVK item 45). De uitlenende club stelt de overeenkomst op en tekent, de
          ontvangende club tekent, de federatie bevestigt. Pas dan staat de speler op de selectielijst van die ploeg. Hij blijft lid van zijn eigen club.
          Seizoen {seizoen.label}.
        </p>
        <Uitleningen rijen={rijen} staf={staf} spelers={spelers} ploegen={ploegen} standaardNaam={String((me as { name?: unknown }).name ?? '')} />
      </div>
    </>
  )
}
