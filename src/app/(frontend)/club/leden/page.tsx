import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { hasRole, userClubId } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { emailVanaf } from '@/lib/registratie-server'
import { ClubLeden, type ClubLid } from './ClubLeden'
import './club-leden.css'

export const dynamic = 'force-dynamic'

const relId = (v: unknown): number | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null || !Number.isFinite(Number(id)) ? null : Number(id)
}
const dag = (v: unknown) => (v ? new Date(String(v)).toISOString().slice(0, 10) : '')

// Ledenlijst van de eigen club: wie mag spelen (✅), wie wacht op de federatie (⏳), wat er nog
// ontbreekt (✎). Hier voert de club leden in, laadt het doktersattest op en dient in.
export default async function ClubLedenPage() {
  const me = await getAuthUser()
  const clubId = userClubId(me)
  const mag = hasRole(me, 'club-beheerder', 'club-medewerker') && clubId != null

  if (!mag) {
    return (
      <>
        <SiteHeader active="clubs" />
        <div className="site site-breed">
          <h1 className="page-title">Leden &amp; registratie</h1>
          <p className="empty">
            {me ? 'Enkel de staf van een club (met een club aan het account) beheert de leden.' : 'Log in als clubverantwoordelijke.'}{' '}
            {!me && <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>}
          </p>
        </div>
      </>
    )
  }

  const payload = await getPayloadClient()
  const [club, teamsRes] = await Promise.all([
    payload.findByID({ collection: 'clubs', id: clubId, depth: 0 }).catch(() => null),
    payload.find({
      collection: 'teams',
      where: { and: [{ club: { equals: clubId } }, { analyseOnly: { not_equals: true } }] },
      sort: 'name',
      depth: 0,
      limit: 200,
      pagination: false,
    }),
  ])
  const teams = teamsRes.docs.map((t) => ({ id: Number(t.id), naam: String(t.name ?? ''), reeks: String(t.reeks ?? '') }))
  const playersRes = teams.length
    ? await payload.find({
        collection: 'players',
        where: { team: { in: teams.map((t) => t.id) } },
        sort: 'name',
        depth: 1,
        limit: 3000,
        pagination: false,
        overrideAccess: true,
      })
    : { docs: [] }

  // Wie heeft al een login (account gekoppeld aan het dossier)? En wie heeft een open aanvraag voor
  // een medische kaart?
  const spelerIds = playersRes.docs.map((p) => Number(p.id))
  const [accounts, aanvragen, vanaf] = await Promise.all([
    spelerIds.length
      ? payload.find({ collection: 'users', where: { player: { in: spelerIds } }, depth: 0, limit: 3000, pagination: false, overrideAccess: true })
      : { docs: [] },
    spelerIds.length
      ? payload.find({
          collection: 'medische-kaart-aanvragen',
          where: { and: [{ player: { in: spelerIds } }, { status: { equals: 'aangevraagd' } }] },
          depth: 0,
          limit: 3000,
          pagination: false,
          overrideAccess: true,
        })
      : { docs: [] },
    emailVanaf(payload),
  ])
  const loginVan = new Map(accounts.docs.map((u) => [relId(u.player), { id: Number(u.id), email: String(u.email ?? '') }]))
  const kaartOpen = new Set(aanvragen.docs.map((a) => relId(a.player)))
  const magLinks = hasRole(me, 'club-beheerder')

  const leden: ClubLid[] = playersRes.docs.map((p) => {
    const attest = p.medischAttestBestand && typeof p.medischAttestBestand === 'object' ? p.medischAttestBestand : null
    return {
      id: Number(p.id),
      teamId: relId(p.team) ?? 0,
      naam: String(p.name ?? ''),
      voornaam: String(p.voornaam ?? ''),
      achternaam: String(p.achternaam ?? ''),
      birthDate: dag(p.birthDate),
      geslacht: String(p.geslacht ?? ''),
      soortLid: String(p.soortLid ?? 'speler'),
      shirtNumber: Number(p.shirtNumber ?? 0),
      medischeKeuringOp: dag(p.medischeKeuringOp),
      attestUrl: attest?.filename ? `/api/medische-attesten/file/${encodeURIComponent(String(attest.filename))}` : null,
      registratieStatus: String(p.registratieStatus ?? ''),
      afkeurReden: String(p.afkeurReden ?? ''),
      vergunningsstatus: String(p.vergunningsstatus ?? 'geen'),
      medischAttest: Boolean(p.medischAttest),
      actief: p.actief !== false,
      email: String(p.email ?? ''),
      login: loginVan.get(Number(p.id)) ?? null,
      kaartOpen: kaartOpen.has(Number(p.id)),
    }
  })

  return (
    <>
      <SiteHeader active="clubs" />
      <div className="site site-breed">
        <h1 className="page-title">
          Leden &amp; registratie <span className="cl-club">{String(club?.name ?? '')}</span>
        </h1>
        <p className="acc-page-intro">
          Voeg een lid toe, vul de medische keuring in en laad het doktersattest op. Vink aan wie klaar is en dien in bij de
          federatie. Zodra de federatie goedkeurt, staat er een <strong>✅</strong> en kan het lid opgesteld worden.
        </p>
        {teams.length === 0 ? (
          <p className="empty">Je club heeft nog geen ploegen. Vraag de federatie om je ploegen aan te maken.</p>
        ) : (
          <ClubLeden teams={teams} leden={leden} emailVanaf={vanaf} magLinks={magLinks} />
        )}
      </div>
    </>
  )
}
