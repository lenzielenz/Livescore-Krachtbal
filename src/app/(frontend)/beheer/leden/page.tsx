import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { AGE_CATEGORIES } from '@/lib/age-categories'
import { getAuthUser } from '@/lib/auth-user'
import { formatDateBE } from '@/lib/datetime'
import { hasFunctionGrant } from '@/lib/function-grants'
import { filterNaarQuery, filterUitParams, KEURING_LABEL, type LedenFilter, teDoen, TOON_LABEL, type Toon } from '@/lib/leden-register'
import { ledenTellingen, ledenZoeken, type Sortering } from '@/lib/leden-register-server'
import { getPayloadClient } from '@/lib/payload-client'
import { HerinnerKnop } from './HerinnerKnop'
import { KaartAanvragenLijst, type KaartAanvraag } from './KaartAanvragenLijst'
import { RegisterFilter } from './RegisterFilter'
import { RegistratieWachtrij, type Aanvraag } from './RegistratieWachtrij'
import '../../club/leden/club-leden.css'
import '../federatie-tools.css'
import './leden.css'

export const dynamic = 'force-dynamic'

type Tab = 'clubs' | 'register' | 'registraties'
const TABS: { key: Tab; label: string }[] = [
  { key: 'clubs', label: 'Per club' },
  { key: 'register', label: 'Ledenregister' },
  { key: 'registraties', label: 'Registraties & kaarten' },
]
const rel = (v: unknown): { id: number | null; name: string } =>
  v && typeof v === 'object' ? { id: (v as { id?: number }).id ?? null, name: String((v as { name?: unknown }).name ?? '—') } : { id: typeof v === 'number' ? v : null, name: '—' }
const dag = (v: unknown) => (v ? new Date(String(v)).toISOString().slice(0, 10) : '')

// Het ledenregister van de federatie (lib/leden-register.ts). Gebouwd voor duizenden leden bij
// honderden clubs: niets laadt "alles" in de browser. Bovenaan de tellingen (klik = filter), dan drie
// tabbladen: per club (wie heeft werk, herinnering sturen), het register (zoeken, filteren, bladeren,
// exporteren — alles in de URL, dus de terug-knop en een gedeelde link werken) en de registraties die
// op een beslissing wachten. Elk lid opent een dossier met alles op één plek (/beheer/leden/[id]).
export default async function LedenPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await getAuthUser()
  const payload = await getPayloadClient()
  const granted = await hasFunctionGrant(payload, (me as { id?: number } | null)?.id, 'beheer/leden')
  if (!isFederationLevel(me) && !granted) {
    return (
      <>
        <SiteHeader active="federatie" />
        <div className="site site-breed">
          <h1 className="page-title">
            <span className="brand">Leden</span>
          </h1>
          <p className="empty">
            Enkel de federatie/admin beheert het ledenregister.{' '}
            <Link href="/inloggen" style={{ color: 'var(--accent)' }}>
              Inloggen →
            </Link>
          </p>
        </div>
      </>
    )
  }

  const sp = await searchParams
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : 'clubs'
  const filter = filterUitParams(sp)
  const [tellingen, settings] = await Promise.all([ledenTellingen(payload), payload.findGlobal({ slug: 'settings', depth: 0 }).catch(() => null)])
  const t = tellingen.totaal
  const beleid = (settings as { keuringVerlopen?: string } | null)?.keuringVerlopen === 'blokkeren' ? 'blokkeren' : 'waarschuwen'
  const naarRegister = (f: LedenFilter) => `/beheer/leden?${filterNaarQuery({ ...f, tab: 'register' } as LedenFilter)}`

  const tegels: { label: string; n: number; href: string; toon?: string }[] = [
    { label: 'Leden', n: t.totaal, href: naarRegister({}) },
    { label: TOON_LABEL.ok, n: t.ok, href: naarRegister({ toon: 'ok' }), toon: 'ok' },
    { label: TOON_LABEL.wacht, n: t.wacht, href: '/beheer/leden?tab=registraties', toon: 'wacht' },
    { label: 'Aan te vullen', n: t.todo, href: naarRegister({ toon: 'todo' }), toon: 'todo' },
    { label: TOON_LABEL.fout, n: t.fout, href: naarRegister({ toon: 'fout' }), toon: 'fout' },
    { label: 'Keuring verloopt ≤ 30 d', n: t.verloopt, href: naarRegister({ keuring: 'verloopt' }), toon: 'verloopt' },
    { label: 'Keuring verlopen', n: t.verlopen, href: naarRegister({ keuring: 'verlopen' }), toon: 'verlopen' },
    { label: 'Geen keuringsdatum', n: t.onbekend, href: naarRegister({ keuring: 'onbekend' }), toon: 'onbekend' },
  ]

  return (
    <>
      <SiteHeader active="federatie" />
      <div className="site site-breed">
        <h1 className="page-title">
          <span className="brand">Leden &amp; keuring</span>
        </h1>
        <p className="acc-page-intro">
          Alle leden van alle clubs, met hun vergunning en medische keuring. Een keuring geldt 365 dagen. Een verlopen keuring{' '}
          <strong>{beleid === 'blokkeren' ? 'blokkeert de opstelling' : 'geeft een waarschuwing in de opstelling'}</strong>
          {beleid === 'waarschuwen' && t.verlopen > 0 ? ` — blokkeren zou nu ${t.verlopen} speler${t.verlopen === 1 ? '' : 's'} raken` : ''} (
          <Link href="/admin/globals/settings">instelling</Link>). De medische kaart draagt een QR-code:{' '}
          <Link href="/medische-kaart/opladen">📷 kaarten opladen</Link> in een stapel zet elke kaart bij het juiste lid.
        </p>

        <nav className="led-tegels" aria-label="Tellingen">
          {tegels.map((x) => (
            <Link key={x.label} href={x.href} className={`led-tegel ${x.toon ? `led-t-${x.toon}` : ''}`}>
              <span className="led-tegel-n">{x.n.toLocaleString('nl-BE')}</span>
              <span className="led-tegel-l">{x.label}</span>
            </Link>
          ))}
        </nav>

        <nav className="led-tabs" aria-label="Weergave">
          {TABS.map((x) => (
            <Link key={x.key} href={x.key === 'register' ? naarRegister(filter) : `/beheer/leden?tab=${x.key}`} className={`led-tab ${tab === x.key ? 'on' : ''}`} aria-current={tab === x.key ? 'page' : undefined}>
              {x.label}
              {x.key === 'registraties' && t.wacht > 0 ? <span className="fs-teller fs-teller-klein">{t.wacht}</span> : null}
            </Link>
          ))}
        </nav>

        {tab === 'clubs' && <PerClub clubs={tellingen.clubs} naarRegister={naarRegister} />}
        {tab === 'register' && <Register sp={sp} filter={filter} clubs={tellingen.clubs.map((c) => ({ id: c.clubId, naam: c.clubNaam }))} />}
        {tab === 'registraties' && <Registraties />}
      </div>
    </>
  )
}

function PerClub({ clubs, naarRegister }: { clubs: Awaited<ReturnType<typeof ledenTellingen>>['clubs']; naarRegister: (f: LedenFilter) => string }) {
  const gesorteerd = [...clubs].sort((a, b) => teDoen(b) - teDoen(a) || a.clubNaam.localeCompare(b.clubNaam))
  const cel = (n: number, f: LedenFilter, klas = '') =>
    n > 0 ? (
      <Link href={naarRegister(f)} className={`led-cel ${klas}`}>
        {n}
      </Link>
    ) : (
      <span className="led-nul">0</span>
    )
  return (
    <section>
      <p className="ft-stat">
        {clubs.length} clubs. Bovenaan wie het meeste werk heeft. Elk getal opent die leden in het register.
      </p>
      <div className="ft-tabel-wrap">
        <table className="ft-tabel led-tabel">
          <thead>
            <tr>
              <th>Club</th>
              <th title="Alle leden">Leden</th>
              <th title={TOON_LABEL.ok}>Mag spelen</th>
              <th title={TOON_LABEL.wacht}>Wacht</th>
              <th title="Aan te vullen door de club">Aanvullen</th>
              <th title={TOON_LABEL.fout}>Afgekeurd</th>
              <th title={KEURING_LABEL.verloopt}>Verloopt</th>
              <th title={KEURING_LABEL.verlopen}>Verlopen</th>
              <th title={KEURING_LABEL.onbekend}>Zonder datum</th>
              <th>Herinnering</th>
            </tr>
          </thead>
          <tbody>
            {gesorteerd.map((c) => (
              <tr key={c.clubId}>
                <td>
                  <Link href={naarRegister({ club: c.clubId })}>{c.clubNaam}</Link>
                </td>
                <td>{cel(c.totaal, { club: c.clubId })}</td>
                <td>{cel(c.ok, { club: c.clubId, toon: 'ok' }, 'ok')}</td>
                <td>{cel(c.wacht, { club: c.clubId, toon: 'wacht' })}</td>
                <td>{cel(c.todo, { club: c.clubId, toon: 'todo' }, 'let')}</td>
                <td>{cel(c.fout, { club: c.clubId, toon: 'fout' }, 'fout')}</td>
                <td>{cel(c.verloopt, { club: c.clubId, keuring: 'verloopt' }, 'let')}</td>
                <td>{cel(c.verlopen, { club: c.clubId, keuring: 'verlopen' }, 'fout')}</td>
                <td>{cel(c.onbekend, { club: c.clubId, keuring: 'onbekend' })}</td>
                <td>
                  {teDoen(c) > 0 ? (
                    <HerinnerKnop clubId={c.clubId} clubNaam={c.clubNaam} aan={c.staf.map((s) => s.naam)} laatst={c.laatstHerinnerd ? formatDateBE(c.laatstHerinnerd) : null} />
                  ) : (
                    <span className="led-nul">in orde</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

const KLEUR: Record<Toon, string> = { ok: 'ok', wacht: 'wacht', todo: 'let', fout: 'fout', lid: 'nul', inactief: 'nul' }

async function Register({ sp, filter, clubs }: { sp: Record<string, string | string[] | undefined>; filter: LedenFilter; clubs: { id: number; naam: string }[] }) {
  const payload = await getPayloadClient()
  const sort = (['naam', '-naam', 'keuring', '-gewijzigd'] as Sortering[]).includes(sp.sort as Sortering) ? (sp.sort as Sortering) : 'naam'
  const pagina = Math.max(1, Number(sp.pagina) || 1)
  const r = await ledenZoeken(payload, filter, { pagina, perPagina: 50, sort })
  const q = (extra: Record<string, unknown>) => `/beheer/leden?${filterNaarQuery({ ...filter, tab: 'register', sort, ...extra } as LedenFilter)}`
  const csv = `/api/federatie/leden?${filterNaarQuery({ ...filter, sort, formaat: 'csv' } as LedenFilter)}`
  return (
    <section>
      <RegisterFilter
        filter={filter}
        sort={sort}
        clubs={[...clubs].sort((a, b) => a.naam.localeCompare(b.naam))}
        categorieen={[...AGE_CATEGORIES]}
        toonOpties={Object.entries(TOON_LABEL)}
        keuringOpties={Object.entries(KEURING_LABEL).filter(([k]) => k !== 'nvt')}
      />
      <p className="ft-stat">
        {r.totaal.toLocaleString('nl-BE')} {r.totaal === 1 ? 'lid' : 'leden'}
        {r.paginas > 1 ? ` — pagina ${r.pagina} van ${r.paginas}` : ''} ·{' '}
        <a href={csv} download>
          ⬇ Exporteren (CSV)
        </a>
      </p>
      {r.rijen.length === 0 ? (
        <p className="empty">Geen leden voor dit filter.</p>
      ) : (
        <div className="ft-tabel-wrap">
          <table className="ft-tabel led-tabel">
            <thead>
              <tr>
                <th>Naam</th>
                <th>Club · ploeg</th>
                <th>Cat.</th>
                <th>Toestand</th>
                <th>Keuring</th>
                <th>Vergunning</th>
              </tr>
            </thead>
            <tbody>
              {r.rijen.map((l) => (
                <tr key={l.id}>
                  <td>
                    <Link href={`/beheer/leden/${l.id}`} className="led-naam">
                      {l.naam || '—'}
                    </Link>
                  </td>
                  <td className="led-dim">
                    {l.club || '—'}
                    {l.ploeg ? ` · ${l.ploeg}` : ''}
                  </td>
                  <td>{l.categorie}</td>
                  <td>
                    <span className={`led-chip ${KLEUR[l.toon]}`} title={l.toon === 'fout' && l.afkeurReden ? l.afkeurReden : undefined}>
                      {TOON_LABEL[l.toon]}
                    </span>
                  </td>
                  <td>
                    {l.keuring === 'nvt' ? (
                      <span className="led-nul">—</span>
                    ) : (
                      <span className={`led-chip ${l.keuring === 'geldig' ? 'ok' : l.keuring === 'verlopen' ? 'fout' : l.keuring === 'verloopt' ? 'let' : 'nul'}`}>
                        {l.keuringOp ? formatDateBE(l.keuringOp) : 'geen datum'}
                        {l.keuring === 'verlopen' ? ' · verlopen' : l.keuring === 'verloopt' ? ` · nog ${l.keuringDagen} d` : ''}
                      </span>
                    )}
                    {!l.heeftAttest && l.keuring !== 'nvt' ? <span className="led-dim"> · geen attest</span> : null}
                  </td>
                  <td className="led-dim">{l.vergunningsnummer || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {r.paginas > 1 && (
        <nav className="led-paginas" aria-label="Pagina's">
          {r.pagina > 1 && <Link href={q({ pagina: r.pagina - 1 })}>← Vorige</Link>}
          <span>
            {r.pagina} / {r.paginas}
          </span>
          {r.pagina < r.paginas && <Link href={q({ pagina: r.pagina + 1 })}>Volgende →</Link>}
        </nav>
      )}
    </section>
  )
}

async function Registraties() {
  const payload = await getPayloadClient()
  const [ingediend, kaartRes] = await Promise.all([
    payload.find({ collection: 'players', where: { registratieStatus: { equals: 'ingediend' } }, sort: 'ingediendOp', depth: 2, limit: 500, overrideAccess: true }),
    payload.find({ collection: 'medische-kaart-aanvragen', where: { status: { equals: 'aangevraagd' } }, sort: 'createdAt', depth: 2, limit: 500, overrideAccess: true }),
  ])
  const aanvragen: Aanvraag[] = ingediend.docs.map((p) => {
    const r = p as unknown as Record<string, unknown>
    const team = rel(r.team)
    const club = team.id != null ? rel((r.team as { club?: unknown } | undefined)?.club) : { id: null, name: '—' }
    const attest = r.medischAttestBestand && typeof r.medischAttestBestand === 'object' ? (r.medischAttestBestand as { filename?: unknown }) : null
    return {
      id: Number(r.id),
      naam: String(r.name ?? '—'),
      clubNaam: club.name,
      teamNaam: team.name,
      birthDate: dag(r.birthDate),
      geslacht: String(r.geslacht ?? ''),
      soortLid: String(r.soortLid ?? 'speler'),
      medischeKeuringOp: dag(r.medischeKeuringOp),
      attestUrl: attest?.filename ? `/api/medische-attesten/file/${encodeURIComponent(String(attest.filename))}` : null,
      ingediendOp: dag(r.ingediendOp),
      vergunningsnummer: String(r.vergunningsnummer ?? ''),
    }
  })
  const kaarten: KaartAanvraag[] = kaartRes.docs.map((a) => {
    const speler = a.player && typeof a.player === 'object' ? a.player : null
    return {
      id: Number(a.id),
      naam: String(speler?.name ?? '—'),
      clubNaam: a.club && typeof a.club === 'object' ? String(a.club.name ?? '—') : '—',
      via: a.via === 'club' ? 'club' : 'lid',
      op: String(a.createdAt),
      playerId: speler?.id != null ? Number(speler.id) : null,
    }
  })
  return (
    <>
      {ingediend.totalDocs > aanvragen.length && (
        <p className="ft-stat">
          De oudste {aanvragen.length} van {ingediend.totalDocs} ingediende registraties staan hieronder; behandel ze en de volgende verschijnen.
        </p>
      )}
      <RegistratieWachtrij aanvragen={aanvragen} />
      <KaartAanvragenLijst aanvragen={kaarten} />
    </>
  )
}
