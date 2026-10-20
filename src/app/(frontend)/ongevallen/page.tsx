import Link from 'next/link'

import { OngevalDossierKaart } from '@/components/OngevalDossierKaart'
import { SiteHeader } from '@/components/SiteHeader'
import { hasRole, isFederationLevel, userClubId } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { dossiers, STATUS_LABEL, type OngevalStatus } from '@/lib/ongeval-dossier'
import { getPayloadClient } from '@/lib/payload-client'
import '../wedstrijdblad.css'

export const dynamic = 'force-dynamic'

const FILTERS: (OngevalStatus | 'alle')[] = ['ingediend', 'gemeld', 'afgehandeld', 'alle']

// Blessures en ongevalsaangiften. De federatie ziet alles en handelt af; een club ziet die van haar
// leden en kan de documenten voor een speler opladen en indienen (lib/ongeval-dossier.ts).
export default async function OngevallenPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams
  const me = await getAuthUser()
  const federatie = isFederationLevel(me)
  const club = userClubId(me)
  const clubStaf = !federatie && club != null && hasRole(me, 'club-beheerder', 'club-medewerker')

  if (!federatie && !clubStaf) {
    return (
      <>
        <SiteHeader />
        <div className="site site-breed">
          <h1 className="page-title">Blessures &amp; ongevallen</h1>
          <p className="empty">
            Voor de federatie en de clubverantwoordelijken. Een eigen blessure vind je op <Link href="/profiel#ongevallen">Mijn profiel</Link>.
          </p>
        </div>
      </>
    )
  }

  const payload = await getPayloadClient()
  const filter: OngevalStatus | 'alle' = FILTERS.find((f) => f === status) ?? (federatie ? 'ingediend' : 'gemeld')
  const basis = clubStaf ? [{ club: { equals: club } }] : []
  const where = { and: [...basis, ...(filter === 'alle' ? [] : [{ status: { equals: filter } }])] }
  const [lijst, tellingen] = await Promise.all([
    dossiers(payload, where, 200),
    Promise.all(
      (['ingediend', 'gemeld', 'afgehandeld'] as const).map(async (s) => [
        s,
        (await payload.count({ collection: 'accidents', where: { and: [...basis, { status: { equals: s } }] } as never, overrideAccess: true })).totalDocs,
      ]),
    ),
  ])
  const aantal = Object.fromEntries(tellingen) as Record<string, number>

  return (
    <>
      <SiteHeader active={federatie ? 'federatie' : 'clubs'} />
      <div className="site site-breed">
        <h1 className="page-title">Blessures &amp; ongevallen</h1>
        <p className="wb-intro">
          {federatie
            ? 'Elke blessure die bij een wedstrijd doorgegeven wordt, staat hier. De speler (of zijn ouder) laadt de ingevulde aangifte en het geneeskundig getuigschrift op; jij handelt af of stuurt terug.'
            : 'De blessures van de leden van je club. Heeft een speler geen login (of hulp nodig)? Laad de documenten hier voor hem op en dien in.'}
        </p>
        <nav className="od-filters" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 16px' }}>
          {FILTERS.map((f) => (
            <Link key={f} href={`/ongevallen?status=${f}`} className={`wb-btn${f === filter ? ' wb-btn-primary' : ''}`}>
              {f === 'alle' ? 'Alle' : `${STATUS_LABEL[f]} (${aantal[f] ?? 0})`}
            </Link>
          ))}
        </nav>
        {lijst.length === 0 ? (
          <p className="empty">Niets in deze lijst.</p>
        ) : (
          <div className="od-lijst" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
            {lijst.map((d) => (
              <OngevalDossierKaart key={d.id} d={d} rol={federatie ? 'federatie' : 'club'} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
