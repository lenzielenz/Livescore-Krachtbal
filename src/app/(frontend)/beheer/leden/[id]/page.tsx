import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { formatDateBE } from '@/lib/datetime'
import { hasFunctionGrant } from '@/lib/function-grants'
import { KEURING_LABEL, TOON_LABEL } from '@/lib/leden-register'
import { lidDossier } from '@/lib/leden-register-server'
import { getPayloadClient } from '@/lib/payload-client'
import { DossierActies } from './DossierActies'
import '../../federatie-tools.css'
import '../leden.css'

export const dynamic = 'force-dynamic'

const d = (v: string) => (v ? formatDateBE(v) : '—')
const VERGUNNING: Record<string, string> = { geen: 'Geen', aangevraagd: 'Aangevraagd', geldig: 'Geldig' }

// Het dossier van één lid: alles op één plek — gegevens, registratie en vergunning, medische keuring
// met het attest, logins, en wat er aan het lid hangt (medische kaarten, ongevallen, uitleningen,
// sancties). De federatie past hier vergunning, keuring en doktersverbod aan of beslist over een
// ingediende registratie.
/** Een gelezen aankruisvakje: ✓ aangekruist, — leeg, ? twijfel (nakijken). */
const vak = (v: boolean | null) => (v === true ? '✓' : v === false ? '—' : '? nakijken')

export default async function LidDossierPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getAuthUser()
  const payload = await getPayloadClient()
  const mag = isFederationLevel(me) || (await hasFunctionGrant(payload, (me as { id?: number } | null)?.id, 'beheer/leden'))
  const id = Number((await params).id)
  const lid = mag && Number.isInteger(id) ? await lidDossier(payload, id) : null
  if (!lid) {
    return (
      <>
        <SiteHeader active="federatie" />
        <div className="site site-breed">
          <p className="empty">
            {mag ? 'Dit lid bestaat niet.' : 'Enkel de federatie bekijkt een lidsdossier.'} <Link href="/beheer/leden">← Leden</Link>
          </p>
        </div>
      </>
    )
  }
  return (
    <>
      <SiteHeader active="federatie" />
      <div className="site site-breed">
        <p className="led-dim">
          <Link href="/beheer/leden?tab=register">← Ledenregister</Link>
          {lid.club.id != null && (
            <>
              {' · '}
              <Link href={`/beheer/leden?tab=register&club=${lid.club.id}`}>{lid.club.naam}</Link>
            </>
          )}
        </p>
        <h1 className="page-title">{lid.naam || 'Lid'}</h1>
        <p>
          <Link href={`/lid/${lid.id}`}>📇 Ledenfiche: adres, contact, toestemmingen en documenten →</Link>
        </p>
        <p>
          <span className={`led-chip ${lid.toon === 'ok' ? 'ok' : lid.toon === 'fout' ? 'fout' : lid.toon === 'wacht' ? 'wacht' : lid.toon === 'todo' ? 'let' : 'nul'}`}>{TOON_LABEL[lid.toon]}</span>{' '}
          {lid.keuring !== 'nvt' && (
            <span className={`led-chip ${lid.keuring === 'geldig' ? 'ok' : lid.keuring === 'verlopen' ? 'fout' : lid.keuring === 'verloopt' ? 'let' : 'nul'}`}>
              {KEURING_LABEL[lid.keuring]}
              {lid.keuringDagen != null && lid.keuring !== 'geldig' ? (lid.keuringDagen < 0 ? ` (${-lid.keuringDagen} d)` : ` (nog ${lid.keuringDagen} d)`) : ''}
            </span>
          )}
          {lid.vernieuwdNaBeoordeling && <span className="led-chip wacht"> Keuring vernieuwd na de goedkeuring — attest nakijken</span>}
        </p>

        <div className="led-dossier">
          <section className="ft-kaart">
            <h2>Gegevens</h2>
            <dl>
              <dt>Voornaam · naam</dt>
              <dd>
                {lid.voornaam || '—'} {lid.achternaam}
              </dd>
              <dt>Geboren</dt>
              <dd>
                {d(lid.geboortedatum)} {lid.categorie && `· ${lid.categorie}`}
              </dd>
              <dt>Geslacht</dt>
              <dd>{lid.geslacht === 'm' ? 'Man' : lid.geslacht === 'v' ? 'Vrouw' : '—'}</dd>
              <dt>Club · ploeg</dt>
              <dd>
                {lid.club.naam || '—'} · {lid.ploeg.naam || '—'} {lid.rugnummer != null ? `#${lid.rugnummer}` : ''}
              </dd>
              <dt>Soort</dt>
              <dd>{lid.soortLid === 'lid' ? 'Gewoon lid' : 'Speler'}</dd>
              <dt>E-mail</dt>
              <dd>
                {lid.email || '—'} {lid.login ? '· heeft een login' : ''}
              </dd>
              <dt>Ouders</dt>
              <dd>
                {[lid.ouderEmail, lid.ouder2Email].filter(Boolean).join(' · ') || '—'} {lid.ouderLogin ? '· heeft een login' : ''}
              </dd>
            </dl>
          </section>

          <section className="ft-kaart">
            <h2>Registratie &amp; vergunning</h2>
            <dl>
              <dt>Registratie</dt>
              <dd>{lid.registratieStatus || 'concept'}</dd>
              <dt>Ingediend</dt>
              <dd>{d(lid.ingediendOp)}</dd>
              <dt>Beoordeeld</dt>
              <dd>{d(lid.beoordeeldOp)}</dd>
              {lid.afkeurReden && (
                <>
                  <dt>Afgekeurd</dt>
                  <dd>{lid.afkeurReden}</dd>
                </>
              )}
              <dt>Vergunning</dt>
              <dd>
                {VERGUNNING[lid.vergunningsstatus] ?? lid.vergunningsstatus} {lid.vergunningsnummer && `· nr. ${lid.vergunningsnummer}`}
              </dd>
              <dt>Doktersverbod</dt>
              <dd>{lid.hogerSpelenVerbod ? 'Mag niet hoger spelen' : '—'}</dd>
            </dl>
          </section>

          <section className="ft-kaart">
            <h2>Medische keuring</h2>
            <dl>
              <dt>Gekeurd op</dt>
              <dd>{d(lid.keuringOp)}</dd>
              <dt>Geldig tot</dt>
              <dd>{lid.keuringOp ? d(new Date(new Date(lid.keuringOp).getTime() + 365 * 86_400_000).toISOString()) : '—'}</dd>
              <dt>Attest</dt>
              <dd>
                {lid.attest ? (
                  <a href={lid.attest.url} target="_blank" rel="noreferrer">
                    📄 Openen{lid.attest.op ? ` (opgeladen ${d(lid.attest.op)})` : ''}
                  </a>
                ) : (
                  'Geen attest opgeladen'
                )}
                {lid.attest?.viaQr && <span className="led-chip ok"> herkend via QR</span>}
                {lid.attest?.lezing && (
                  <span className="led-sub">
                    {' '}
                    Gelezen{lid.attest.lezing.uitlijning === 'qr' ? ' (enkel op de QR uitgelijnd — nakijken)' : ''}: geschikt{' '}
                    {vak(lid.attest.lezing.vakjes.geschikt.aangekruist)} · mag niet hoger {vak(lid.attest.lezing.vakjes.nietHoger.aangekruist)}
                  </span>
                )}
              </dd>
              <dt>Medische kaart</dt>
              <dd>
                {lid.kaarten.length ? lid.kaarten.map((k) => `${k.status} (${d(k.op)})`).join(', ') : '—'} ·{' '}
                <a href={`/api/medische-kaart/pdf?ids=${lid.id}`} target="_blank" rel="noopener">
                  🖨️ kaart met QR afdrukken
                </a>
              </dd>
            </dl>
          </section>

          <section className="ft-kaart">
            <h2>Dossiers</h2>
            <dl>
              <dt>Ongevallen</dt>
              <dd>
                {lid.ongevallen.length ? (
                  <ul>
                    {lid.ongevallen.map((o) => (
                      <li key={o.id}>
                        {d(o.op)} · {o.titel} · {o.status}
                      </li>
                    ))}
                  </ul>
                ) : (
                  '—'
                )}
              </dd>
              <dt>Uitleningen</dt>
              <dd>
                {lid.uitleningen.length ? (
                  <ul>
                    {lid.uitleningen.map((u) => (
                      <li key={u.id}>
                        <a href={`/api/uitlening/${u.id}/pdf`} target="_blank" rel="noreferrer">
                          {u.competitie}
                        </a>{' '}
                        → {u.naar} · {u.status}
                      </li>
                    ))}
                  </ul>
                ) : (
                  '—'
                )}
              </dd>
              <dt>Sancties</dt>
              <dd>{lid.sancties.length ? lid.sancties.map((s) => `${s.aantal}× ${s.reden || 'knipje'} (${d(s.op)})`).join(', ') : '—'}</dd>
            </dl>
          </section>
        </div>

        <DossierActies
          id={lid.id}
          ingediend={lid.registratieStatus === 'ingediend'}
          vergunningsstatus={lid.vergunningsstatus}
          medischAttest={lid.medischAttest}
          hogerSpelenVerbod={lid.hogerSpelenVerbod}
        />
      </div>
    </>
  )
}
