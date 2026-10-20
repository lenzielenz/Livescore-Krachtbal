import Link from 'next/link'

import { TeamLogo } from '@/components/TeamLogo'
import type { Kerncijfer, PloegRij, TeDoen } from '@/lib/club-overzicht'

// Bovenaan "Mijn club" voor de clubstaf: de club, haar kerncijfers, wat er te doen is en het
// ledenbestand per ploeg. Alles klikt door naar de plek waar je het regelt.
export function ClubDashboard({
  club,
  seizoen,
  kerncijfers,
  teDoen,
  ploegen,
}: {
  club: { naam: string; logoUrl: string | null; logoFit: unknown }
  seizoen: string | null
  kerncijfers: Kerncijfer[]
  teDoen: TeDoen[]
  ploegen: PloegRij[]
}) {
  return (
    <section className="cdash" aria-label="Overzicht van je club">
      <header className="cdash-kop">
        <TeamLogo name={club.naam} logoUrl={club.logoUrl} logoFit={club.logoFit as never} size={52} />
        <div className="cdash-kop-tekst">
          <h2 className="cdash-naam">{club.naam}</h2>
          {seizoen && <span className="cdash-sub">Seizoen {seizoen}</span>}
        </div>
      </header>

      <div className="cdash-cijfers">
        {kerncijfers.map((k) => (
          <Link key={k.sleutel} href={k.href} className={`cdash-cijfer toon-${k.toon}`}>
            <span className="cdash-waarde">{k.waarde}</span>
            <span className="cdash-label">{k.label}</span>
          </Link>
        ))}
      </div>

      <div className="cdash-blok">
        <h3 className="cmenu-titel">Te doen</h3>
        {teDoen.length === 0 ? (
          <p className="cdash-rust">✓ Alles in orde — niets dat op de club wacht.</p>
        ) : (
          <ul className="cdash-taken">
            {teDoen.map((t) => (
              <li key={t.sleutel}>
                <Link href={t.href} className={`cdash-taak${t.dringend ? ' dringend' : ''}`}>
                  <span aria-hidden className="cdash-bol" />
                  <span className="cdash-taak-tekst">{t.tekst}</span>
                  <span aria-hidden>›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {ploegen.length > 0 && (
        <div className="cdash-blok">
          <div className="cdash-blok-kop">
            <h3 className="cmenu-titel">Ledenbestand per ploeg</h3>
            <span className="cdash-acties">
              <Link href="/club/leden" className="cdash-knop">Volledig ledenbestand →</Link>
            </span>
          </div>
          <div className="cdash-tabel-wrap">
            <table className="cdash-tabel">
              <thead>
                <tr>
                  <th scope="col">Ploeg</th>
                  <th scope="col" className="getal">Leden</th>
                  <th scope="col" className="getal" title="Mogen spelen">✅</th>
                  <th scope="col" className="getal" title="Wacht op de federatie">⏳</th>
                  <th scope="col" className="getal" title="Aan te vullen">✎</th>
                </tr>
              </thead>
              <tbody>
                {ploegen.map((p) => (
                  <tr key={p.id}>
                    <th scope="row">
                      <span className="cdash-ploeg">{p.naam}</span>
                      {p.reeks && <span className="cdash-reeks">{p.reeks}</span>}
                    </th>
                    <td className="getal">{p.totaal}</td>
                    <td className="getal">{p.ok}</td>
                    <td className={`getal${p.wacht ? ' let-op' : ''}`}>{p.wacht || '–'}</td>
                    <td className={`getal${p.todo ? ' actie' : ''}`}>{p.todo || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
