import Link from 'next/link'
import QRCode from 'qrcode'

import { SiteHeader } from '@/components/SiteHeader'
import { hasRole, userClubId } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { formatDateBE } from '@/lib/datetime'
import { BETAALSTAND_LABEL } from '@/lib/facturatie'
import { factuurInstellingen, facturenLijst, mollieActief } from '@/lib/facturatie-server'
import { getPayloadClient } from '@/lib/payload-client'
import { epcQrTekst } from '@/lib/submit/pdf-factuur'
import { OnlineBetalen } from './OnlineBetalen'
import '../../beheer/federatie-tools.css'
import '../../beheer/facturen/facturen.css'
import '../../wedstrijdblad.css'

export const dynamic = 'force-dynamic'

const eur = (n: number) => new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(n)

// De facturen van de federatie aan de eigen club: wat open staat, met alles om te betalen (rekening,
// gestructureerde mededeling, betaal-QR voor de bank-app, of online), en wat al betaald is. Of iets betaald
// is, volgt uit de geboekte betalingen (lib/facturatie.ts).
export default async function ClubFacturenPage({ searchParams }: { searchParams: Promise<{ betaald?: string }> }) {
  const me = await getAuthUser()
  const clubId = userClubId(me)
  if (!(hasRole(me, 'club-beheerder', 'club-medewerker') && clubId != null)) {
    return (
      <>
        <SiteHeader active="clubs" />
        <div className="site site-breed">
          <h1 className="page-title">Facturen</h1>
          <p className="empty">
            Enkel de staf van een club ziet de facturen. {!me && <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>}
          </p>
        </div>
      </>
    )
  }
  const payload = await getPayloadClient()
  const [rijen, inst] = await Promise.all([
    facturenLijst(payload, { and: [{ club: { equals: Number(clubId) } }, { status: { not_equals: 'concept' } }] }),
    factuurInstellingen(payload),
  ])
  const open = rijen.filter((r) => ['open', 'deels', 'vervallen'].includes(r.beeld.stand))
  const rest = rijen.filter((r) => !open.includes(r))
  const qrs = new Map<number, string>()
  for (const r of open) {
    const epc = epcQrTekst({ naam: inst.naam, iban: inst.iban, bic: inst.bic, bedrag: r.beeld.open, ogm: r.ogm ?? '' })
    if (epc) qrs.set(r.id, await QRCode.toDataURL(epc, { errorCorrectionLevel: 'M', margin: 1, width: 280 }))
  }
  const net = (await searchParams).betaald

  return (
    <>
      <SiteHeader active="clubs" />
      <div className="site site-breed fa">
        <h1 className="page-title">🧾 Facturen</h1>
        <p className="acc-page-intro">
          Facturen van de federatie aan je club. Betaal met de gestructureerde mededeling: dan wordt je betaling vanzelf gekoppeld. Een online betaling of
          een overschrijving verschijnt hier zodra ze binnen is.
        </p>
        {net && <p className="fa-let">Bedankt! Zodra de betaling bevestigd is, staat de factuur hier als betaald (meestal binnen enkele minuten).</p>}

        <h2>Te betalen {open.length ? `(${eur(open.reduce((t, r) => t + r.beeld.open, 0))})` : ''}</h2>
        {open.length === 0 ? (
          <p className="empty">Niets te betalen. ✅</p>
        ) : (
          open.map((r) => (
            <section key={r.id} className="fc-kaart">
              <div>
                <h3>
                  Factuur {r.nummer} <span className={`fa-stand fa-stand-${r.beeld.stand}`}>{BETAALSTAND_LABEL[r.beeld.stand]}</span>
                </h3>
                <p className="fa-dim">
                  {r.datum ? formatDateBE(r.datum) : ''} · te betalen vóór {r.vervaldatum ? formatDateBE(r.vervaldatum) : '—'}
                  {r.beeld.betaald > 0 ? ` · al betaald ${eur(r.beeld.betaald)}` : ''}
                </p>
                <p style={{ fontSize: '1.6rem', fontWeight: 800, margin: '8px 0 4px' }}>{eur(r.beeld.open)}</p>
                <p className="fa-dim">Rekening {inst.iban || '(volgt)'} · {inst.naam}</p>
                <p className="fc-mededeling">{r.ogm}</p>
                <ul className="fa-betalingen" style={{ margin: '8px 0' }}>
                  {r.lijnen.map((l, i) => (
                    <li key={i}>
                      {l.omschrijving} — {eur(l.aantal * l.eenheidsprijs)}
                    </li>
                  ))}
                </ul>
                <div className="fa-knoppen">
                  <a className="wb-btn" href={`/api/facturen/${r.id}/pdf`} target="_blank" rel="noopener">
                    PDF
                  </a>
                  {mollieActief() && <OnlineBetalen id={r.id} />}
                </div>
              </div>
              {qrs.has(r.id) && (
                <figure style={{ margin: 0, textAlign: 'center' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- een data-URL, gemaakt op de server */}
                  <img className="fc-qr" src={qrs.get(r.id)} alt={`Betaal-QR voor factuur ${r.nummer}`} />
                  <figcaption className="fa-dim">Scan met je bank-app</figcaption>
                </figure>
              )}
            </section>
          ))
        )}

        {rest.length > 0 && (
          <>
            <h2>Eerdere facturen</h2>
            <ul className="fa-lijst">
              {rest.map((r) => (
                <li key={r.id} className="fa-factuur">
                  <a className="fa-regel" href={`/api/facturen/${r.id}/pdf`} target="_blank" rel="noopener" style={{ textDecoration: 'none' }}>
                    <span className="fa-nr">{r.nummer}</span>
                    <span className="fa-club">{r.lijnen.map((l) => l.omschrijving).join(', ')}</span>
                    <span className="fa-dim">{r.datum ? formatDateBE(r.datum) : ''}</span>
                    <span className="fa-r">{eur(r.totaal)}</span>
                    <span className={`fa-stand fa-stand-${r.beeld.stand}`}>{BETAALSTAND_LABEL[r.beeld.stand]}</span>
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  )
}
