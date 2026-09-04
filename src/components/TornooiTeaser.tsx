import Link from 'next/link'

import { magTornooiAantekenen } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { isSupportersMode } from '@/lib/score-mode'
import { loadGroepData } from '@/lib/tornooi-groep'
import { TornooiAftel } from './TornooiAftel'
import { TornooiLive, type TornooiLiveData } from './TornooiLive'
import './tornooi-teaser.css'

type LiveBlok = { data: TornooiLiveData; magScoren: boolean }

// Homepage-teaser voor de eerstvolgende (of lopende) tornooidag: géén wedstrijden — enkel een
// snellink met aftelklok, zodat nieuwe mensen in één tik hun weg vinden naar het tornooi.
// Rendert niets als er geen lopend tornooi is.
export async function TornooiTeaser() {
  const payload = await getPayloadClient()
  const res = await payload
    .find({ collection: 'tournaments', where: { status: { equals: 'live' } }, depth: 1, limit: 50, sort: 'createdAt' })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  if (res.docs.length === 0) return null

  // Groepeer per tornooidag (groep); losse tornooien staan op zichzelf.
  type Doel = { titel: string; href: string; logoUrl: string | null; ids: number[]; groep: string | null }
  const doelen = new Map<string, Doel>()
  for (const t of res.docs as { id: number; name?: string; groep?: string | null; hostClub?: unknown }[]) {
    const groep = typeof t.groep === 'string' && t.groep.trim() ? t.groep.trim() : ''
    const sleutel = groep || `los-${t.id}`
    const host = t.hostClub && typeof t.hostClub === 'object' ? (t.hostClub as { logoUrl?: string | null; logo?: { url?: string } | null }) : null
    const logoUrl = host?.logo && typeof host.logo === 'object' && host.logo.url ? host.logo.url : (typeof host?.logoUrl === 'string' ? host.logoUrl : null)
    const bestaand = doelen.get(sleutel)
    if (bestaand) {
      bestaand.ids.push(t.id)
      if (!bestaand.logoUrl && logoUrl) bestaand.logoUrl = logoUrl
    } else {
      doelen.set(sleutel, {
        titel: groep || String(t.name ?? 'Tornooi'),
        href: groep ? `/tornooi/groep/${encodeURIComponent(groep)}` : `/tornooi/${t.id}`,
        logoUrl,
        ids: [t.id],
        groep: groep || null,
      })
    }
  }

  // Per doel: is er nu iets bezig, of wanneer start de eerstvolgende geplande wedstrijd?
  const alleIds = [...doelen.values()].flatMap((d) => d.ids)
  const mRes = await payload
    .find({ collection: 'tournament-matches', where: { tournament: { in: alleIds } }, depth: 0, limit: 1000 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const matches = mRes.docs as { tournament?: number | { id: number }; status?: string; plannedAt?: string | null }[]
  const tidOf = (m: (typeof matches)[number]) => (typeof m.tournament === 'object' ? m.tournament?.id : m.tournament)

  const nu = Date.now()
  let beste: { d: Doel; bezig: boolean; start: number | null } | null = null
  for (const d of doelen.values()) {
    const eigen = matches.filter((m) => d.ids.includes(Number(tidOf(m))))
    const bezig = eigen.some((m) => m.status === 'live')
    const toekomst = eigen
      .map((m) => (m.status === 'pending' && m.plannedAt ? new Date(m.plannedAt).getTime() : NaN))
      .filter((t) => Number.isFinite(t) && t > nu)
      .sort((a, b) => a - b)[0]
    const kandidaat = { d, bezig, start: bezig ? null : (toekomst ?? null) }
    // Bezig wint; anders de dichtstbijzijnde start. Zonder planning tonen we niets voor dit doel.
    if (!bezig && kandidaat.start == null) continue
    if (!beste) beste = kandidaat
    else if (kandidaat.bezig && !beste.bezig) beste = kandidaat
    else if (!kandidaat.bezig && !beste.bezig && kandidaat.start != null && beste.start != null && kandidaat.start < beste.start) beste = kandidaat
  }
  if (!beste) return null

  // Is er iets bezig, dan halen we de wedstrijden van die dag erbij zodat ze meteen onder de
  // snellink staan — zelfde idee als het live-bord van de competitie. Enkel dán: op een dag zonder
  // lopende wedstrijd zou dit een extra query zijn die niets oplevert.
  let live: LiveBlok | null = null
  if (beste.bezig && beste.d.groep) {
    const dag = await loadGroepData(payload, beste.d.groep).catch(() => null)
    const bezig = (dag?.matches ?? []).filter((m) => m.status === 'live')
    if (dag && bezig.length > 0) {
      // Wie mag meetellen? Dezelfde regel als aan de tafel zelf, zodat er nooit een knop staat die
      // de server daarna weigert.
      const gebruiker = await getAuthUser()
      const magScoren = magTornooiAantekenen(gebruiker, await isSupportersMode(payload))
      live = {
        data: { groep: beste.d.groep, matches: bezig, logos: dag.logos, fits: dag.fits },
        magScoren,
      }
    }
  }

  return (
    <>
    <Link href={beste.d.href} className={`tteaser${beste.bezig ? ' live' : ''}`}>
      {beste.d.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="tteaser-logo" src={beste.d.logoUrl} alt="" />
      )}
      <span className="tteaser-tekst">
        <span className="tteaser-titel">🏆 {beste.d.titel}</span>
        {beste.bezig ? (
          <span className="tteaser-sub live">● Nu bezig — volg live</span>
        ) : (
          <span className="tteaser-sub">
            Start over <TornooiAftel naar={beste.start as number} />
          </span>
        )}
      </span>
      <span className="tteaser-pijl" aria-hidden>→</span>
    </Link>
    {live && <TornooiLive initieel={live.data} magScoren={live.magScoren} href={beste.d.href} />}
    </>
  )
}
