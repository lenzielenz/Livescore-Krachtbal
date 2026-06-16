import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { getAuthUser } from '@/lib/auth-user'
import { computeBadges, earnedCount, type BadgeStats } from '@/lib/badges'
import { sanitizeCheckins } from '@/lib/checkins'
import { getPayloadClient } from '@/lib/payload-client'
import './badges.css'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Mijn badges — Krachtbal Live' }

export default async function BadgesPage() {
  const authUser = await getAuthUser()
  if (!authUser) {
    return (
      <>
        <SiteHeader />
        <div className="site">
          <h1 className="page-title">🏅 <span className="brand">Mijn badges</span></h1>
          <section className="wb-card" style={{ maxWidth: 440 }}>
            <p className="wb-sub">Log in om je badges te verzamelen.</p>
            <Link href="/inloggen" className="wb-btn wb-btn-primary">Inloggen →</Link>
          </section>
        </div>
      </>
    )
  }

  const payload = await getPayloadClient()
  const me = (await payload
    .findByID({ collection: 'users', id: (authUser as { id: number }).id, depth: 1 })
    .catch(() => null)) as unknown as Record<string, unknown> | null
  const u = me ?? (authUser as unknown as Record<string, unknown>)

  // Aantal geplaatste tribunefoto's (eigen match-instants).
  let photos = 0
  try {
    const res = await payload.find({
      collection: 'match-instants',
      where: { author: { equals: (authUser as { id: number }).id } },
      limit: 1,
      depth: 0,
    })
    photos = res.totalDocs
  } catch {
    photos = 0
  }

  const booster = u.pronostiekPower as { mult?: unknown } | null | undefined
  const stats: BadgeStats = {
    checkins: sanitizeCheckins(u.checkins).length,
    photos,
    profileComplete: Boolean(u.photo) && Boolean(u.club) && Boolean(u.position),
    boosterWon: Boolean(booster && booster.mult),
  }

  const badges = computeBadges(stats)
  const earned = earnedCount(badges)
  const total = badges.length

  return (
    <>
      <SiteHeader />
      <div className="site">
        <h1 className="page-title">🏅 <span className="brand">Mijn badges</span></h1>
        <p className="wb-intro">
          Verzamel badges door wedstrijden bij te wonen, sfeerfoto’s te plaatsen en je profiel compleet te maken.
          {' '}<Link href="/profiel/paspoort" style={{ color: 'var(--accent)', fontWeight: 700 }}>Supporterpaspoort →</Link>
        </p>

        <div className="bg-progress">
          <div className="bg-progress-top">
            <span className="bg-progress-count">{earned}<i>/{total}</i></span>
            <span className="bg-progress-lbl">badges verdiend</span>
          </div>
          <div className="bg-bar"><span style={{ width: `${Math.round((earned / total) * 100)}%` }} /></div>
        </div>

        <div className="bg-grid">
          {badges.map((b) => (
            <div key={b.key} className={`bg-card${b.earned ? ' is-earned' : ''}`}>
              <span className="bg-emoji" aria-hidden>{b.emoji}</span>
              <span className="bg-title">{b.title}</span>
              <span className="bg-desc">{b.desc}</span>
              {b.earned ? (
                <span className="bg-state bg-state-on">✓ Verdiend</span>
              ) : b.progress ? (
                <span className="bg-prog">
                  <span className="bg-prog-bar"><i style={{ width: `${Math.round((b.progress.have / b.progress.need) * 100)}%` }} /></span>
                  <span className="bg-prog-txt">{b.progress.have}/{b.progress.need}</span>
                </span>
              ) : (
                <span className="bg-state">Vergrendeld</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
