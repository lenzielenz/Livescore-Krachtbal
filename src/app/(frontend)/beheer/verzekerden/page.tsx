import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { formatDateBE } from '@/lib/datetime'
import { lidmaatschappenBijwerken, verzekerden } from '@/lib/lidmaatschap'
import { getPayloadClient } from '@/lib/payload-client'
import { huidigSeizoen } from '@/lib/uitlening'
import { FederatieAlleen } from '../FederatieAlleen'
import '../federatie-tools.css'
import '../../wedstrijdblad.css'

export const dynamic = 'force-dynamic'

// De verzekerdenlijst per seizoen (lib/lidmaatschap.ts): wie aangesloten (en dus verzekerd) was, per club, van
// wanneer tot wanneer — voor de verzekeraar. "Nieuw sinds" geeft de aanvullingen sinds de vorige doorgave.
export default async function VerzekerdenPage({ searchParams }: { searchParams: Promise<{ seizoen?: string; club?: string; sinds?: string }> }) {
  const me = await getAuthUser()
  if (!isFederationLevel(me)) return <FederatieAlleen titel="Verzekerden" />
  const payload = await getPayloadClient()
  const q = await searchParams
  const huidig = (await huidigSeizoen(payload)).label
  const seizoen = q.seizoen && /^\d{4}-\d{4}$/.test(q.seizoen) ? q.seizoen : huidig
  // Het lopende seizoen eerst bijwerken: zo is de lijst altijd die van vandaag.
  if (seizoen === huidig) await lidmaatschappenBijwerken(payload).catch(() => null)
  const club = q.club ? Number(q.club) : null
  const sinds = q.sinds && /^\d{4}-\d{2}-\d{2}$/.test(q.sinds) ? q.sinds : null
  const [rijen, clubs, seizoenen] = await Promise.all([
    verzekerden(payload, seizoen, { club, sinds }),
    payload.find({ collection: 'clubs', where: { analyseOnly: { not_equals: true } }, sort: 'name', depth: 0, limit: 500, pagination: false, overrideAccess: true }),
    payload.db.find<{ seizoen?: string }>({ collection: 'lidmaatschappen', limit: 0, pagination: false, select: { seizoen: true } }),
  ])
  const alleSeizoenen = [...new Set([huidig, ...seizoenen.docs.map((d) => String(d.seizoen))])].sort().reverse()
  const qs = new URLSearchParams({ seizoen, ...(club ? { club: String(club) } : {}), ...(sinds ? { sinds } : {}) }).toString()
  const spelers = rijen.filter((r) => r.soort === 'speler').length
  const zonderAdres = rijen.filter((r) => !r.straat || !r.gemeente).length

  return (
    <>
      <SiteHeader active="federatie" />
      <div className="site site-breed">
        <h1 className="page-title">🛡️ Verzekerden</h1>
        <p className="acc-page-intro">
          Wie in een seizoen aangesloten (en dus verzekerd) was: spelers met een geldige vergunning en goedgekeurde gewone leden, per club, met de
          datum van aansluiting. Wie stopt of van club verandert, blijft in de lijst van dat seizoen staan tot de dag dat het veranderde.
        </p>
        <form className="wb-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.82rem' }}>
            Seizoen
            <select name="seizoen" defaultValue={seizoen} className="wb-select">
              {alleSeizoenen.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.82rem' }}>
            Club
            <select name="club" defaultValue={club ?? ''} className="wb-select">
              <option value="">Alle clubs</option>
              {clubs.docs.map((c) => (
                <option key={c.id} value={c.id}>
                  {String(c.name)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.82rem' }}>
            Nieuw sinds (optioneel)
            <input type="date" name="sinds" defaultValue={sinds ?? ''} className="wb-input" />
          </label>
          <button type="submit" className="wb-btn">
            Tonen
          </button>
          <a className="wb-btn wb-btn-primary" href={`/api/federatie/verzekerden?${qs}`}>
            ⬇ Lijst voor de verzekeraar (CSV)
          </a>
        </form>
        <p className="wb-sub" style={{ margin: '12px 0' }}>
          <strong>{rijen.length}</strong> verzekerden ({spelers} spelers, {rijen.length - spelers} gewone leden)
          {sinds ? ` aangesloten sinds ${formatDateBE(sinds)}` : ''}.{' '}
          {zonderAdres > 0 && <>Van {zonderAdres} ontbreekt het adres: de club of het lid vult het aan op de ledenfiche.</>}
        </p>
        {rijen.length === 0 ? (
          <p className="empty">Geen verzekerden voor deze keuze.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="wb-table" style={{ width: '100%', fontSize: '0.88rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Naam</th>
                  <th style={{ textAlign: 'left' }}>Geboren</th>
                  <th style={{ textAlign: 'left' }}>Adres</th>
                  <th style={{ textAlign: 'left' }}>Club</th>
                  <th style={{ textAlign: 'left' }}>Soort</th>
                  <th style={{ textAlign: 'left' }}>Vanaf</th>
                  <th style={{ textAlign: 'left' }}>Tot</th>
                </tr>
              </thead>
              <tbody>
                {rijen.slice(0, 500).map((r) => (
                  <tr key={`${r.id}-${r.clubId}`}>
                    <td>
                      <Link href={`/lid/${r.id}`}>{r.naam}</Link>
                    </td>
                    <td>{r.geboortedatum ? formatDateBE(r.geboortedatum) : '—'}</td>
                    <td>{[r.straat, [r.postcode, r.gemeente].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—'}</td>
                    <td>{r.club}</td>
                    <td>{r.soort === 'lid' ? 'gewoon lid' : 'speler'}</td>
                    <td>{formatDateBE(r.vanaf)}</td>
                    <td>{r.tot ? formatDateBE(r.tot) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rijen.length > 500 && <p className="wb-sub">De eerste 500 van {rijen.length}; de CSV bevat iedereen.</p>}
          </div>
        )}
      </div>
    </>
  )
}
