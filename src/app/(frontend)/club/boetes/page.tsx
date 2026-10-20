import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { hasRole, userClubId } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { boeteLijst, OPEN_STATUSSEN, scheidsrechterskosten } from '@/lib/boetes'
import { formatDateBE } from '@/lib/datetime'
import { getPayloadClient } from '@/lib/payload-client'
import { formatEuro } from '@/lib/vergoeding'
import { ClubBoetes } from './ClubBoetes'
import '../../beheer/federatie-tools.css'
import '../../wedstrijdblad.css'

export const dynamic = 'force-dynamic'

const BETALER: Record<string, string> = { federatie: 'de federatie', thuisclub: 'de thuisclub', gedeeld: 'beide clubs, elk de helft' }

// Boetes en scheidsrechterskosten van de eigen club (lib/boetes.ts): wat er openstaat, betaling
// melden of betwisten, en wat de club aan scheidsrechters verschuldigd is volgens de federatie-instelling.
export default async function ClubBoetesPage() {
  const me = await getAuthUser()
  const clubId = userClubId(me)
  if (!(hasRole(me, 'club-beheerder', 'club-medewerker') && clubId != null)) {
    return (
      <>
        <SiteHeader active="clubs" />
        <div className="site site-breed">
          <h1 className="page-title">Boetes &amp; kosten</h1>
          <p className="empty">
            Enkel de staf van een club ziet de boetes. {!me && <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>}
          </p>
        </div>
      </>
    )
  }
  const payload = await getPayloadClient()
  const boetes = await boeteLijst(payload, { and: [{ club: { equals: Number(clubId) } }, { status: { not_equals: 'voorstel' } }] })
  const open = boetes.filter((b) => (OPEN_STATUSSEN as readonly string[]).includes(b.status))
  const seizoenStart = new Date(new Date().getFullYear() - (new Date().getMonth() < 7 ? 1 : 0), 7, 1).toISOString()
  const kosten = await scheidsrechterskosten(payload, Number(clubId), seizoenStart)
  return (
    <>
      <SiteHeader active="clubs" />
      <div className="site site-breed">
        <h1 className="page-title">💶 Boetes &amp; kosten</h1>
        <p className="acc-page-intro">
          Openstaand: <strong>{formatEuro(open.reduce((t, b) => t + b.bedrag, 0))}</strong>. Betaald? Meld het hier, de federatie bevestigt. Niet akkoord? Betwist met een woordje uitleg.
        </p>
        <ClubBoetes boetes={boetes} />

        <h2 style={{ margin: '24px 0 6px', fontSize: '1.05rem' }}>🧑‍⚖️ Scheidsrechterskosten dit seizoen</h2>
        {!kosten.betaler && !kosten.forfaitBetaler ? (
          <p className="empty">De federatie heeft nog niet ingesteld wie de scheidsrechterskosten draagt.</p>
        ) : (
          <>
            <p className="od-dim">
              {kosten.betaler ? `Gefloten wedstrijden: betaald door ${BETALER[kosten.betaler] ?? kosten.betaler} (€13 + km × €0,4327). ` : ''}
              {kosten.forfaitBetaler === 'forfaitploeg' ? 'Bij forfait: de ploeg die forfait gaf (€13 + km × €0,4259).' : ''}
            </p>
            {kosten.rijen.length === 0 ? (
              <p className="empty">Nog geen kosten voor jouw club.</p>
            ) : (
              <div className="ft-tabel-wrap">
                <table className="ft-tabel">
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Wedstrijd</th>
                      <th>Soort</th>
                      <th style={{ textAlign: 'right' }}>Bedrag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kosten.rijen.map((r) => (
                      <tr key={`${r.matchId}-${r.soort}`}>
                        <td>{formatDateBE(new Date(r.datum))}</td>
                        <td>
                          <Link href={`/match/${r.matchId}`}>{r.titel}</Link>
                        </td>
                        <td>
                          {r.soort === 'forfait' ? 'Forfait' : 'Scheidsrechter'}
                          {r.aandeel < 1 ? ' (helft)' : ''}
                        </td>
                        <td style={{ textAlign: 'right' }}>{formatEuro(r.bedrag)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={3}>
                        <strong>Totaal</strong>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <strong>{formatEuro(kosten.totaal)}</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
