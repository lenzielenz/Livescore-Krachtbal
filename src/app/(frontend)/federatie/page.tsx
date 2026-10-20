import Link from 'next/link'

import { ProfileTools } from '@/components/ProfileTools'
import { SiteHeader } from '@/components/SiteHeader'
import { hasRole, isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { federatieTaken } from '@/lib/federatie-dashboard'
import { getPayloadClient } from '@/lib/payload-client'
import { getProfile } from '@/lib/profiles'
import { getScoreMode } from '@/lib/score-mode'
import { ScoreModeSwitch } from './ScoreModeSwitch'
import './federatie-dashboard.css'

export const dynamic = 'force-dynamic'

// De grote knoppen op het dashboard: per taak van het seizoen, in de volgorde waarin je ze nodig hebt.
const TOOLGROEPEN: { titel: string; tools: { href: string; icoon: string; label: string; uitleg: string }[] }[] = [
  {
    titel: 'Competitie',
    tools: [
      { href: '/beheer/kalender', icoon: '🗓️', label: 'Kalender opmaken', uitleg: 'Per reeks heen en terug, met vrije weekends.' },
      { href: '/beheer/wedstrijden', icoon: '🔁', label: 'Wedstrijden verplaatsen', uitleg: 'Datum en uur aanpassen; clubs krijgen een melding.' },
      { href: '/beheer/afgelastingen', icoon: '⛈️', label: 'Afgelastingen', uitleg: "Door de scheidsrechter afgelast, met foto's; nieuwe datum plannen." },
      { href: '/beheer/inschrijvingen', icoon: '📝', label: 'Inschrijvingen & kalender', uitleg: 'Ronde openen, inschrijvingen van de clubs verwerken, seizoenskalender met hun voorkeuren maken.' },
      { href: '/beheer/planner', icoon: '🧩', label: 'Planner', uitleg: 'Wedstrijden per weekend verslepen; botsingen meteen zichtbaar; verplaatsingsaanvragen beslissen.' },
      { href: '/beheer/boetes', icoon: '💶', label: 'Boetes', uitleg: 'Voorstellen (forfait, blad te laat, aftrap later) beoordelen, opleggen, betalingen bevestigen.' },
      { href: '/beheer/planning', icoon: '📅', label: 'Planning importeren', uitleg: 'Kalender of reeksindeling uit een bestand.' },
      { href: '/federatie/reglement', icoon: '📖', label: 'Reglement & regels', uitleg: 'Versies, verslagen, vastspelen en eindrondes.' },
    ],
  },
  {
    titel: 'Mensen',
    tools: [
      { href: '/beheer/clubs', icoon: '🏟️', label: 'Clubs & logins', uitleg: 'Club aanmaken, clubbeheerder uitnodigen.' },
      { href: '/beheer/scheidsrechters', icoon: '🧑‍⚖️', label: 'Scheidsrechters toewijzen', uitleg: 'Per speeldag, met automatisch invullen.' },
      { href: '/beheer/leden', icoon: '🩺', label: 'Spelers keuren', uitleg: 'Aanvragen van clubs goedkeuren of afkeuren.' },
      { href: '/ongevallen', icoon: '🚑', label: 'Blessures & ongevallen', uitleg: 'Aangiften en getuigschriften van spelers behandelen.' },
    ],
  },
  {
    titel: 'Seizoen',
    tools: [
      { href: '/federatie/statistieken', icoon: '📊', label: 'Statistieken', uitleg: 'Leden, jeugd, meisjes/jongens, forfaits, scheidsrechters, per club.' },
      { href: '/federatie/referendum', icoon: '🏅', label: 'Speler van het jaar', uitleg: 'Stemronde openen, sluiten en uitslag bekendmaken.' },
      { href: '/knipjes', icoon: '✂️', label: 'Knipjes', uitleg: 'Sancties en schorsingen.' },
      { href: '/bekerfinale', icoon: '🏆', label: 'Bekerfinale', uitleg: 'Finaledag voorbereiden.' },
    ],
  },
]

// Instappunt voor de federatie: van hieruit vind je beheer, planning, reglement,
// knipjes en de bekerfinale. De tools komen uit lib/profiles (gedeeld met de header).
// Enkel federatie/admin krijgen de hub; admin-only tools verschijnen alleen voor admins.
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

  const profile = getProfile('federatie')
  // De aantekenmodus staat bovenaan: het is de schakelaar met de grootste impact op het platform.
  const payload = await getPayloadClient()
  const [scoreMode, taken] = await Promise.all([getScoreMode(payload), federatieTaken(payload)])
  const open = taken.filter((t) => t.aantal > 0)

  return (
    <>
      <SiteHeader active="federatie" />
      <div className="site site-breed">
        <h1 className="page-title">
          <span className="brand">Federatie</span>
        </h1>
        <section className="fd-taken" aria-labelledby="fd-taken-titel">
          <h2 id="fd-taken-titel" className="fd-kop">
            {open.length === 0 ? '✅ Alles in orde — niets te doen' : `Te doen (${open.reduce((n, t) => n + t.aantal, 0)})`}
          </h2>
          <div className="fd-grid">
            {open.map((t) => (
              <article key={t.sleutel} className={`fd-taak fd-${t.dringend}`}>
                <div className="fd-taak-kop">
                  <span className="fd-icoon" aria-hidden>{t.icoon}</span>
                  <span className="fd-aantal">{t.aantal}</span>
                  <span className="fd-titel">{t.titel}</span>
                </div>
                <p className="fd-uitleg">{t.uitleg}</p>
                {t.items.length > 0 && (
                  <ul className="fd-items">
                    {t.items.map((i, n) => (
                      <li key={n}>{i.href ? <Link href={i.href}>{i.label}</Link> : i.label}</li>
                    ))}
                  </ul>
                )}
                {t.aantal > 0 && (
                  <Link className="fd-actie" href={t.href}>
                    {t.actie} →
                  </Link>
                )}
              </article>
            ))}
          </div>
          {taken.some((t) => t.aantal === 0) && (
            <p className="fd-inorde">
              <span>In orde:</span>
              {taken
                .filter((t) => t.aantal === 0)
                .map((t) => (
                  <span key={t.sleutel} className="fd-chip">
                    ✓ {t.titel}
                  </span>
                ))}
            </p>
          )}
        </section>

        <section className="fd-tools" aria-labelledby="fd-tools-titel">
          <h2 id="fd-tools-titel" className="fd-kop">Tools</h2>
          <div className="fd-toolgroepen">
            {TOOLGROEPEN.map((g) => (
              <div key={g.titel} className="fd-toolgroep">
                <h3>{g.titel}</h3>
                {g.tools.map((tool) => (
                  <Link key={tool.href} href={tool.href} className="fd-tool">
                    <span className="fd-tool-icoon" aria-hidden>{tool.icoon}</span>
                    <span>
                      <strong>{tool.label}</strong>
                      <small>{tool.uitleg}</small>
                    </span>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </section>

        <p className="profile-lead">{profile.intro}</p>
        <ScoreModeSwitch initial={scoreMode} />
        <ProfileTools profile={profile} isAdmin={hasRole(me, 'admin')} />
      </div>
    </>
  )
}
