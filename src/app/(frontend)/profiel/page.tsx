import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { competitionWhere } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { dedupeKey } from '@/lib/dedupe'
import { normalizeLogoFit } from '@/lib/logo-fit'
import { getPayloadClient } from '@/lib/payload-client'
import { AccountVerwijderen } from './AccountVerwijderen'
import { ProfileForm, type ProfileInitial } from './ProfileForm'
import '../wedstrijdblad.css'
import './profiel.css'

export const dynamic = 'force-dynamic'

const idOf = (v: unknown): string => {
  if (v == null) return ''
  if (typeof v === 'object') return String((v as { id?: unknown }).id ?? '')
  return String(v)
}

// "Mijn profiel": elk lid beheert hier zelf zijn naam, club, speelpositie, profielfoto en wachtwoord.
export default async function ProfielPage() {
  const authUser = await getAuthUser()
  if (!authUser) {
    return (
      <>
        <SiteHeader />
        <div className="site">
          <h1 className="page-title"><span className="brand">Mijn profiel</span></h1>
          <section className="wb-card" style={{ maxWidth: 440 }}>
            <p className="wb-sub">Log in om je profiel te beheren.</p>
            <Link href="/inloggen" className="wb-btn wb-btn-primary">Inloggen →</Link>
          </section>
        </div>
      </>
    )
  }

  const payload = await getPayloadClient()
  const me = await payload.findByID({ collection: 'users', id: (authUser as { id: number }).id, depth: 1 }).catch(() => null)
  const u = (me ?? authUser) as unknown as Record<string, unknown>

  const fit = normalizeLogoFit({ zoom: Number(u.photoZoom), offsetX: Number(u.photoOffsetX), offsetY: Number(u.photoOffsetY) })
  const photo = u.photo as { url?: string } | number | null | undefined
  const photoUrl = photo && typeof photo === 'object' ? (photo.url ?? null) : null

  // Clublijst (zelfde ontdubbeling als bij registreren).
  const clubsRes = await payload
    .find({ collection: 'clubs', where: competitionWhere(), sort: 'name', depth: 0, limit: 500 })
    .catch(() => ({ docs: [] as { id: number; name: string }[] }))
  const byKey = new Map<string, { id: number; name: string }>()
  for (const c of clubsRes.docs) {
    const name = String(c.name ?? '')
    if (!name) continue
    const k = dedupeKey(name)
    const ex = byKey.get(k)
    const better = !ex || name.split(' ').length > ex.name.split(' ').length || (name.split(' ').length === ex.name.split(' ').length && name.length > ex.name.length)
    if (better) byKey.set(k, { id: c.id as number, name })
  }
  const clubs = [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name))

  const followedClubIds = (Array.isArray(u.followedClubs) ? u.followedClubs : [])
    .map((c) => Number(idOf(c)))
    .filter((n) => Number.isFinite(n))

  const initial: ProfileInitial = {
    email: String(u.email ?? ''),
    name: String(u.name ?? ''),
    clubId: idOf(u.club),
    followedClubIds,
    position: typeof u.position === 'string' ? u.position : '',
    photoUrl,
    zoom: fit.zoom,
    offsetX: fit.offsetX,
    offsetY: fit.offsetY,
  }

  return (
    <>
      <SiteHeader />
      <div className="site">
        <h1 className="page-title"><span className="brand">Mijn profiel</span></h1>
        <p className="wb-intro">
          Stel hier je eigen profiel samen: je naam, je club, je positie in het spel en je profielfoto
          (uploaden, inzoomen en verschuiven). Klaar? <Link href="/profiel/scorecard" style={{ color: 'var(--accent)', fontWeight: 700 }}>Bekijk je scorecard →</Link> · <Link href="/profiel/paspoort" style={{ color: 'var(--accent)', fontWeight: 700 }}>Supporterpaspoort →</Link> · <Link href="/profiel/badges" style={{ color: 'var(--accent)', fontWeight: 700 }}>Badges →</Link>
        </p>
        <ProfileForm initial={initial} clubs={clubs} />
        <AccountVerwijderen />
      </div>
    </>
  )
}
