import Link from 'next/link'

import { verborgenInDemo } from '@/lib/omgeving'

// De indeling van "Mijn club": vijf vaste plekken in een tabbalk, zodat niet alles onder elkaar staat.
//   Overzicht   — wat te doen is en de wedstrijden van dit en volgend weekend (startpunt)
//   Wedstrijden — alle komende wedstrijden, per speelweekend
//   Leden       — ledenbestand, registratie, uitleningen, coaches, blessures   (clubstaf)
//   Geld        — boetes, facturen, scheidsrechterskosten                     (clubstaf)
//   Meer        — statistieken, schermen, pronostiek, referendum, inschrijving
// Elke tegel staat op precies één plek. Wat enkel de clubstaf aangaat, ziet een coach niet.

export type ClubTab = 'overzicht' | 'wedstrijden' | 'leden' | 'geld' | 'meer'
export const CLUB_TABS: ClubTab[] = ['overzicht', 'wedstrijden', 'leden', 'geld', 'meer']

type Tegel = { href: string; icoon: string; label: string; tab: Exclude<ClubTab, 'overzicht'>; staf?: boolean; beheerder?: boolean }

const TEGELS: Tegel[] = [
  { tab: 'wedstrijden', href: '/wedstrijdbladen', icoon: '📄', label: 'Wedstrijdbladen' },
  { tab: 'leden', href: '/club/leden', icoon: '🪪', label: 'Leden — wie mag spelen', staf: true },
  { tab: 'leden', href: '/beheer/spelers', icoon: '➕', label: 'Speler toevoegen', staf: true },
  { tab: 'leden', href: '/club/uitleningen', icoon: '🤝', label: 'Uitleningen jeugd', staf: true },
  { tab: 'leden', href: '/beheer/club-team', icoon: '👥', label: 'Coaches & tafel', beheerder: true },
  { tab: 'leden', href: '/ongevallen', icoon: '🚑', label: 'Blessures', staf: true },
  { tab: 'geld', href: '/club/facturen', icoon: '🧾', label: 'Facturen', staf: true },
  { tab: 'geld', href: '/club/boetes', icoon: '💶', label: 'Boetes & scheidsrechterskosten', staf: true },
  { tab: 'meer', href: '/club/inschrijving', icoon: '📝', label: 'Inschrijving seizoen', staf: true },
  { tab: 'meer', href: '/club/seizoen', icoon: '📊', label: 'Seizoensstatistieken' },
  { tab: 'meer', href: '/club/veldscherm', icoon: '🏟️', label: 'Veldscherm', staf: true },
  { tab: 'meer', href: '/kantine', icoon: '🍻', label: 'Kantinescherm', staf: true },
  { tab: 'meer', href: '/cast', icoon: '📺', label: 'Naar tv', staf: true },
  { tab: 'meer', href: '/club/voorspel', icoon: '🔮', label: 'Pronostiek', staf: true },
  { tab: 'meer', href: '/referendum', icoon: '🏅', label: 'Referendum' },
  { tab: 'meer', href: '/beheer/training/aanwezigheid', icoon: '✅', label: 'Aanwezigheid' },
]

const LABEL: Record<ClubTab, { icoon: string; tekst: string }> = {
  overzicht: { icoon: '🏠', tekst: 'Overzicht' },
  wedstrijden: { icoon: '📅', tekst: 'Wedstrijden' },
  leden: { icoon: '🪪', tekst: 'Leden' },
  geld: { icoon: '💶', tekst: 'Geld' },
  meer: { icoon: '⋯', tekst: 'Meer' },
}

/** Welke tabbladen deze gebruiker ziet: een coach geen Leden en Geld. */
export function zichtbareTabs(staf: boolean): ClubTab[] {
  return staf ? CLUB_TABS : ['overzicht', 'wedstrijden', 'meer']
}

/** De tabbalk bovenaan "Mijn club". `tellers` zet een bolletje met een getal achter een tab (iets te doen). */
export function ClubTabs({ actief, staf, tellers = {} }: { actief: ClubTab; staf: boolean; tellers?: Partial<Record<ClubTab, number>> }) {
  return (
    <nav className="ctabs" aria-label="Onderdelen van je club">
      {zichtbareTabs(staf).map((t) => (
        <Link key={t} href={t === 'overzicht' ? '/club' : `/club?tab=${t}`} className={`ctab${t === actief ? ' actief' : ''}`} aria-current={t === actief ? 'page' : undefined}>
          <span className="ctab-icoon" aria-hidden>
            {LABEL[t].icoon}
          </span>
          <span className="ctab-tekst">{LABEL[t].tekst}</span>
          {tellers[t] ? <span className="ctab-teller">{tellers[t]}</span> : null}
        </Link>
      ))}
    </nav>
  )
}

/** De tegels van één tabblad. */
export function ClubTegels({ tab, staf, beheerder, titel }: { tab: Exclude<ClubTab, 'overzicht'>; staf: boolean; beheerder: boolean; titel?: string }) {
  const tegels = TEGELS.filter((t) => t.tab === tab && (!t.staf || staf) && (!t.beheerder || beheerder) && !verborgenInDemo(t.href))
  if (!tegels.length) return null
  return (
    <section className="cmenu">
      {titel && <h2 className="cmenu-titel">{titel}</h2>}
      <div className="cmenu-raster">
        {tegels.map((t) => (
          <Link key={t.href} href={t.href} className="cmenu-tegel">
            <span className="cmenu-icoon" aria-hidden>
              {t.icoon}
            </span>
            <span className="cmenu-label">{t.label}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
