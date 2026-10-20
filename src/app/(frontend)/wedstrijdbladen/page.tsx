import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { formatDateBE } from '@/lib/datetime'
import { buildScoreboards } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'
import { magWedstrijdbladZienVoor } from '@/lib/wedstrijdblad-toegang'
import { BladenLijst, type BladRij } from './BladenLijst'
import '../wedstrijdblad.css'
import './wedstrijdbladen.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Wedstrijdbladen — Krachtbal Live' }

const relId = (v: unknown): number | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null || !Number.isFinite(Number(id)) ? null : Number(id)
}

// Het archief van de wedstrijdbladen: elk afgetekend (en elk nog af te tekenen) blad, altijd terug
// te vinden, met de PDF. De federatie ziet alles; een club, coach of speler de bladen waar hij bij
// betrokken is (dezelfde regel als de PDF zelf, lib/wedstrijdblad-toegang.ts).
export default async function WedstrijdbladenPage() {
  const me = await getAuthUser()
  if (!me) {
    return (
      <>
        <SiteHeader />
        <div className="site">
          <h1 className="page-title">📄 Wedstrijdbladen</h1>
          <p className="empty">
            Log in om de wedstrijdbladen van je club te zien. <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
          </p>
        </div>
      </>
    )
  }
  const payload = await getPayloadClient()
  const sheets = await payload.find({
    collection: 'matchsheets',
    where: { status: { in: ['af_te_tekenen', 'ingediend'] } },
    depth: 2,
    sort: '-updatedAt',
    limit: 1000,
    pagination: false,
    overrideAccess: true,
  })
  const klachten = await payload
    .find({ collection: 'klachten', depth: 0, limit: 2000, pagination: false, overrideAccess: true })
    .catch(() => ({ docs: [] as { match?: unknown; status?: unknown }[] }))
  const klachtVan = new Map<number, string>()
  for (const k of klachten.docs) {
    const mid = relId(k.match)
    if (mid != null && (k.status === 'open' || !klachtVan.has(mid))) klachtVan.set(mid, String(k.status ?? ''))
  }

  const zichtbaar = sheets.docs.filter((s) => {
    const m = s.match && typeof s.match === 'object' ? s.match : null
    if (!m || m.analyseOnly) return false
    const team = (t: unknown) => ({
      id: relId(t) ?? -1,
      club: t && typeof t === 'object' ? relId((t as { club?: unknown }).club) : null,
      category: t && typeof t === 'object' ? String((t as { category?: unknown }).category ?? '') : null,
    })
    const spelers = [...((s.homeLineup ?? []) as { player?: unknown }[]), ...((s.awayLineup ?? []) as { player?: unknown }[])]
      .map((r) => relId(r.player))
      .filter((x): x is number => x != null)
    return magWedstrijdbladZienVoor(me, { home: team(m.homeTeam), away: team(m.awayTeam), spelers })
  })
  const matches = zichtbaar.map((s) => s.match as { id: number; homeTeam?: unknown; awayTeam?: unknown })
  const borden = await buildScoreboards(payload, matches as never).catch(() => new Map())
  const naam = (t: unknown) => (t && typeof t === 'object' ? String((t as { name?: unknown }).name ?? '—') : '—')
  const rijen: BladRij[] = zichtbaar.map((s) => {
    const m = s.match as { id: number; date?: string; reeks?: string; homeTeam?: unknown; awayTeam?: unknown }
    const b = borden.get(Number(m.id)) as { score?: { home: number; away: number } } | undefined
    return {
      matchId: Number(m.id),
      datum: m.date ? formatDateBE(m.date) : '',
      sorteer: String(m.date ?? ''),
      reeks: m.reeks ? reeksNaam(m.reeks) : '',
      thuis: naam(m.homeTeam),
      uit: naam(m.awayTeam),
      score: b?.score ?? null,
      status: String(s.status),
      klacht: klachtVan.get(Number(m.id)) ?? null,
    }
  })
  rijen.sort((a, b) => b.sorteer.localeCompare(a.sorteer))

  return (
    <>
      <SiteHeader active={isFederationLevel(me) ? 'federatie' : 'clubs'} />
      <div className="site site-breed">
        <h1 className="page-title">📄 Wedstrijdbladen</h1>
        <p className="acc-page-intro">
          Elk wedstrijdblad, altijd terug te vinden: zodra beide kapiteins en de scheidsrechter aftekenen, staat het hier — bij de federatie
          en bij beide clubs — met de PDF om te printen.
          {isFederationLevel(me) ? ' Je ziet de bladen van alle clubs.' : ' Je ziet de bladen van de wedstrijden waar jij of je club bij betrokken was.'}
        </p>
        <BladenLijst rijen={rijen} federatie={isFederationLevel(me)} />
      </div>
    </>
  )
}
