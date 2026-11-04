import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { brusselsDayBoundsUtc, dateStrBE, formatDateBE, formatTimeBE } from '@/lib/datetime'
import { BRON_META, KOLOMMEN, deadlineStand, kolomVan, sorteerKolom, tellingen } from '@/lib/aanvragen-bord'
import { aanvragenLijst } from '@/lib/federatie-aanvragen'
import { type Taak, federatieTaken } from '@/lib/federatie-dashboard'
import { getPayloadClient } from '@/lib/payload-client'
import { getScoreMode } from '@/lib/score-mode'
import { ScoreModeSwitch } from './ScoreModeSwitch'
import './federatie-dashboard.css'

export const dynamic = 'force-dynamic'

const RANG: Record<Taak['dringend'], number> = { rood: 0, oranje: 1, groen: 2 }

const naamVan = (v: unknown): string => (v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '') : '')

type VandaagStatus = { tekst: string; klasse: 'live' | 'af' | 'gepland' | 'afgelast' }
function statusVan(m: { status?: unknown; afgelast?: unknown }): VandaagStatus {
  if (m.afgelast) return { tekst: 'Afgelast', klasse: 'afgelast' }
  if (m.status === 'live') return { tekst: 'Live', klasse: 'live' }
  if (m.status === 'finished') return { tekst: 'Afgelopen', klasse: 'af' }
  return { tekst: 'Gepland', klasse: 'gepland' }
}

// Het dashboard van de federatie: in één blik wat aandacht vraagt (dringendste eerst, met de knop
// om het meteen op te lossen) en wat er vandaag gespeeld wordt. De tools zelf staan in de zijbalk
// van het werkplatform (components/fed-shell, lib/federatie-nav) — niet meer als muur van knoppen
// op deze pagina. Enkel federatie/admin; wie dat niet is, krijgt een uitnodiging om in te loggen.
export default async function FederatiePage() {
  const me = await getAuthUser()
  if (!isFederationLevel(me)) {
    return (
      <>
        <SiteHeader active="federatie" />
        <div className="site site-breed">
          <h1 className="page-title"><span className="brand">Federatie</span></h1>
          <p className="empty">
            Enkel de federatie/admin heeft toegang tot dit luik.{' '}
            <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
          </p>
        </div>
      </>
    )
  }

  const payload = await getPayloadClient()
  const nu = new Date()
  const { start, end } = brusselsDayBoundsUtc(dateStrBE(nu))
  const [scoreMode, taken, bord, vandaagRes] = await Promise.all([
    getScoreMode(payload),
    federatieTaken(payload),
    aanvragenLijst(payload, nu).catch(() => []),
    payload
      .find({
        collection: 'matches',
        where: {
          and: [
            { analyseOnly: { not_equals: true } },
            { isDemo: { not_equals: true } },
            { date: { greater_than_equal: start } },
            { date: { less_than: end } },
          ],
        },
        sort: 'date',
        depth: 1,
        limit: 40,
        pagination: false,
        overrideAccess: true,
      })
      .catch(() => ({ docs: [] })),
  ])

  const open = taken.filter((t) => t.aantal > 0).sort((a, b) => RANG[a.dringend] - RANG[b.dringend] || b.aantal - a.aantal)
  const inOrde = taken.filter((t) => t.aantal === 0)
  const som = (f: (t: Taak) => boolean) => taken.filter(f).reduce((n, t) => n + t.aantal, 0)
  const totaal = som(() => true)
  const dringend = som((t) => t.dringend === 'rood')
  const dezeWeek = som((t) => t.dringend === 'oranje')
  const vandaag = vandaagRes.docs as unknown as { id: number; date?: string; status?: string; afgelast?: boolean; homeTeam?: unknown; awayTeam?: unknown }[]
  const live = vandaag.filter((m) => m.status === 'live' && !m.afgelast).length
  // Het bord: hoeveel staat er in elke kolom, en wat ligt er bij mij (dringendste eerst, hoogstens 6).
  const bordTel = tellingen(bord)
  const mijnId = Number((me as { id: number | string }).id)
  const mijn = sorteerKolom(
    bord.filter((a) => a.open && a.dossier?.behandelaar?.id === mijnId),
    'bezig',
    nu.getTime(),
  ).slice(0, 6)

  return (
    <>
      <SiteHeader active="federatie" />
      <div className="site site-breed fd">
        <header className="fd-hoofd">
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">{formatDateBE(nu, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </header>

        <section className="fd-tegels" aria-label="Kerncijfers">
          <Tegel label="Open taken" waarde={totaal} hint={totaal === 0 ? 'Alles in orde' : `${open.length} soorten`} toon={totaal === 0 ? 'goed' : 'neutraal'} />
          <Tegel label="Dringend" waarde={dringend} hint="Moet nu opgelost" toon={dringend > 0 ? 'rood' : 'goed'} />
          <Tegel label="Deze week" waarde={dezeWeek} hint="Binnenkort aan de beurt" toon={dezeWeek > 0 ? 'oranje' : 'goed'} />
          <Tegel label="Wedstrijden vandaag" waarde={vandaag.length} hint={live > 0 ? `${live} live` : vandaag.length === 0 ? 'Geen speeldag' : 'Nog niet begonnen'} toon="neutraal" />
        </section>

        <div className="fd-kolommen">
          <section className="fd-paneel" aria-labelledby="fd-taken-titel">
            <header className="fd-paneel-kop">
              <h2 id="fd-taken-titel">{open.length === 0 ? 'Niets te doen' : 'Te doen'}</h2>
              {open.length > 0 && <span className="fd-paneel-sub">Dringendste eerst</span>}
            </header>
            {open.length === 0 ? (
              <p className="fd-leeg">✅ Alles in orde — er staat niets open.</p>
            ) : (
              <ul className="fd-rijen">
                {open.map((t) => (
                  <li key={t.sleutel} className={`fd-rij fd-${t.dringend}`}>
                    <span className="fd-rij-icoon" aria-hidden>{t.icoon}</span>
                    <div className="fd-rij-tekst">
                      <strong>{t.titel}</strong>
                      <p>{t.uitleg}</p>
                      {t.items.length > 0 && (
                        <ul className="fd-rij-items">
                          {t.items.map((i, n) => (
                            <li key={n}>{i.href ? <Link href={i.href}>{i.label}</Link> : i.label}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <span className="fd-pil" aria-label={`${t.aantal} open`}>{t.aantal}</span>
                    <Link className="fd-knop" href={t.href}>
                      {t.actie} →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {inOrde.length > 0 && (
              <p className="fd-inorde">
                <span>In orde:</span>
                {inOrde.map((t) => (
                  <span key={t.sleutel} className="fd-chip">✓ {t.titel}</span>
                ))}
              </p>
            )}
          </section>

          <div className="fd-zij">
            <section className="fd-paneel" aria-labelledby="fd-bord-titel">
              <header className="fd-paneel-kop">
                <h2 id="fd-bord-titel">Aanvragen &amp; taken</h2>
                <Link className="fd-paneel-sub" href="/federatie/aanvragen">Open het bord →</Link>
              </header>
              <div className="fd-bord">
                {KOLOMMEN.map((k) => (
                  <Link key={k.key} href={`/federatie/aanvragen`} className={`fd-bord-kolom fd-bord-${k.key}`}>
                    <span className="fd-bord-n">{bordTel[k.key]}</span>
                    <span className="fd-bord-label">{k.titel}</span>
                  </Link>
                ))}
              </div>
              {mijn.length > 0 ? (
                <ul className="fd-mijn">
                  {mijn.map((a) => {
                    const dl = deadlineStand(a.dossier?.deadline, nu.getTime())
                    return (
                      <li key={a.sleutel}>
                        <Link href={`/federatie/aanvragen?dossier=${encodeURIComponent(a.sleutel)}`}>
                          <span aria-hidden>{BRON_META[a.bron].icoon}</span>
                          <span className="fd-mijn-titel">{a.titel}</span>
                          {kolomVan(a) === 'wacht' && <span className="fd-mijn-tag">wacht</span>}
                          {dl && <span className={`fd-mijn-tag fd-mijn-${dl.toon}`}>{dl.tekst}</span>}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="fd-leeg fd-leeg-klein">{bordTel.nieuw > 0 ? `Niets bij jou — wel ${bordTel.nieuw} nieuw op het bord.` : 'Niets bij jou in behandeling.'}</p>
              )}
            </section>

            <section className="fd-paneel" aria-labelledby="fd-vandaag-titel">
              <header className="fd-paneel-kop">
                <h2 id="fd-vandaag-titel">Vandaag</h2>
                <Link className="fd-paneel-sub" href="/beheer/wedstrijden">Alle wedstrijden →</Link>
              </header>
              {vandaag.length === 0 ? (
                <p className="fd-leeg">Vandaag staan er geen wedstrijden gepland.</p>
              ) : (
                <ul className="fd-vandaag">
                  {vandaag.map((m) => {
                    const s = statusVan(m)
                    return (
                      <li key={m.id}>
                        <span className="fd-uur">{m.date ? formatTimeBE(m.date) : ''}</span>
                        <Link href={`/match/${m.id}`} className="fd-ploegen">
                          {naamVan(m.homeTeam) || '?'} – {naamVan(m.awayTeam) || '?'}
                        </Link>
                        <span className={`fd-status fd-status-${s.klasse}`}>{s.tekst}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <section className="fd-paneel" aria-labelledby="fd-modus-titel">
              <header className="fd-paneel-kop">
                <h2 id="fd-modus-titel">Aantekenmodus</h2>
                <span className="fd-paneel-sub">Heel het platform</span>
              </header>
              <ScoreModeSwitch initial={scoreMode} />
            </section>
          </div>
        </div>
      </div>
    </>
  )
}

function Tegel({ label, waarde, hint, toon }: { label: string; waarde: number; hint: string; toon: 'neutraal' | 'goed' | 'oranje' | 'rood' }) {
  return (
    <div className={`fd-tegel fd-tegel-${toon}`}>
      <p className="fd-tegel-label">{label}</p>
      <p className="fd-tegel-waarde">{waarde}</p>
      <p className="fd-tegel-hint">{hint}</p>
    </div>
  )
}
